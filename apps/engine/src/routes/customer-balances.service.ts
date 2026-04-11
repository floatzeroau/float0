import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  customers,
  prepaidPacks,
  customerBalances,
  balanceTransactions,
} from '../db/schema/pos.js';

// ── List active balances ──────────────────────────────

export async function listCustomerBalances(customerId: string) {
  const rows = await db
    .select({
      id: customerBalances.id,
      packName: prepaidPacks.name,
      packId: customerBalances.packId,
      remainingCount: customerBalances.remainingCount,
      originalCount: customerBalances.originalCount,
      pricePaid: customerBalances.pricePaid,
      discountType: customerBalances.discountType,
      discountValue: customerBalances.discountValue,
      purchasedAt: customerBalances.purchasedAt,
      eligibleProductIds: prepaidPacks.eligibleProductIds,
    })
    .from(customerBalances)
    .innerJoin(prepaidPacks, eq(customerBalances.packId, prepaidPacks.id))
    .where(
      and(eq(customerBalances.customerId, customerId), gt(customerBalances.remainingCount, 0)),
    );

  return rows;
}

// ── Purchase (POS/staff) ──────────────────────────────

export async function purchasePack(
  customerId: string,
  orgId: string,
  data: {
    packId: string;
    customCount?: number;
    discountType?: 'percentage' | 'fixed' | null;
    discountValue?: number | null;
    staffId?: string;
  },
) {
  // Verify customer exists
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  // Get pack
  const [pack] = await db
    .select()
    .from(prepaidPacks)
    .where(and(eq(prepaidPacks.id, data.packId), eq(prepaidPacks.organizationId, orgId)))
    .limit(1);

  if (!pack) {
    throw Object.assign(new Error('Pack not found'), { statusCode: 404 });
  }

  // Determine count
  const count = pack.allowCustomSize && data.customCount ? data.customCount : pack.packSize;

  // Calculate price
  const subtotal = pack.perItemValue * count;
  let pricePaid = subtotal;

  if (data.discountType === 'percentage' && data.discountValue) {
    pricePaid = subtotal * (1 - data.discountValue / 100);
  } else if (data.discountType === 'fixed' && data.discountValue) {
    pricePaid = subtotal - data.discountValue;
  }

  if (pricePaid < 0) pricePaid = 0;

  const result = await db.transaction(async (tx) => {
    const [balance] = await tx
      .insert(customerBalances)
      .values({
        customerId,
        organizationId: orgId,
        packId: data.packId,
        remainingCount: count,
        originalCount: count,
        pricePaid,
        discountType: data.discountType ?? null,
        discountValue: data.discountValue ?? null,
      })
      .returning();

    const [txn] = await tx
      .insert(balanceTransactions)
      .values({
        customerBalanceId: balance.id,
        type: 'purchase',
        quantity: count,
        staffId: data.staffId ?? null,
        notes: `Purchased ${count}x "${pack.name}"`,
      })
      .returning();

    return { balance, transaction: txn };
  });

  return result;
}

// ── Portal purchase (customer buys directly) ──────────

export async function portalPurchasePack(customerId: string, orgId: string, packId: string) {
  const [pack] = await db
    .select()
    .from(prepaidPacks)
    .where(
      and(
        eq(prepaidPacks.id, packId),
        eq(prepaidPacks.organizationId, orgId),
        eq(prepaidPacks.isActive, true),
      ),
    )
    .limit(1);

  if (!pack) {
    throw Object.assign(new Error('Pack not found'), { statusCode: 404 });
  }

  const result = await db.transaction(async (tx) => {
    const [balance] = await tx
      .insert(customerBalances)
      .values({
        customerId,
        organizationId: orgId,
        packId,
        remainingCount: pack.packSize,
        originalCount: pack.packSize,
        pricePaid: pack.price,
      })
      .returning();

    const [txn] = await tx
      .insert(balanceTransactions)
      .values({
        customerBalanceId: balance.id,
        type: 'purchase',
        quantity: pack.packSize,
        notes: `Portal purchase: ${pack.packSize}x "${pack.name}"`,
      })
      .returning();

    return { balance, transaction: txn };
  });

  return result;
}

// ── Redeem ────────────────────────────────────────────

export async function redeemBalance(
  customerId: string,
  data: { customerBalanceId: string; quantity?: number; orderId?: string },
) {
  const qty = data.quantity ?? 1;

  const [balance] = await db
    .select()
    .from(customerBalances)
    .where(
      and(
        eq(customerBalances.id, data.customerBalanceId),
        eq(customerBalances.customerId, customerId),
      ),
    )
    .limit(1);

  if (!balance) {
    throw Object.assign(new Error('Balance not found'), { statusCode: 404 });
  }

  if (balance.remainingCount < qty) {
    throw Object.assign(new Error('Insufficient balance'), { statusCode: 400 });
  }

  const result = await db.transaction(async (tx) => {
    await tx
      .update(customerBalances)
      .set({ remainingCount: balance.remainingCount - qty })
      .where(eq(customerBalances.id, balance.id));

    const [txn] = await tx
      .insert(balanceTransactions)
      .values({
        customerBalanceId: balance.id,
        type: 'redeem',
        quantity: -qty,
        orderId: data.orderId ?? null,
      })
      .returning();

    return txn;
  });

  return result;
}

// ── Admin adjust ──────────────────────────────────────

export async function adjustBalance(
  customerId: string,
  data: { customerBalanceId: string; quantity: number; reason?: string; staffId?: string },
) {
  const [balance] = await db
    .select()
    .from(customerBalances)
    .where(
      and(
        eq(customerBalances.id, data.customerBalanceId),
        eq(customerBalances.customerId, customerId),
      ),
    )
    .limit(1);

  if (!balance) {
    throw Object.assign(new Error('Balance not found'), { statusCode: 404 });
  }

  const newRemaining = balance.remainingCount + data.quantity;
  if (newRemaining < 0) {
    throw Object.assign(new Error('Adjustment would result in negative balance'), {
      statusCode: 400,
    });
  }

  const result = await db.transaction(async (tx) => {
    await tx
      .update(customerBalances)
      .set({ remainingCount: newRemaining })
      .where(eq(customerBalances.id, balance.id));

    const [txn] = await tx
      .insert(balanceTransactions)
      .values({
        customerBalanceId: balance.id,
        type: 'admin_adjust',
        quantity: data.quantity,
        staffId: data.staffId ?? null,
        notes: data.reason ?? null,
      })
      .returning();

    return txn;
  });

  return result;
}

// ── Refund restoration ────────────────────────────────

export async function refundRedemption(orderId: string) {
  // Find redeem transactions for this order
  const redeemTxns = await db
    .select()
    .from(balanceTransactions)
    .where(and(eq(balanceTransactions.orderId, orderId), eq(balanceTransactions.type, 'redeem')));

  if (redeemTxns.length === 0) return [];

  const results: (typeof balanceTransactions.$inferSelect)[] = [];

  for (const txn of redeemTxns) {
    const restoreQty = Math.abs(txn.quantity);

    await db.transaction(async (tx) => {
      const [balance] = await tx
        .select()
        .from(customerBalances)
        .where(eq(customerBalances.id, txn.customerBalanceId))
        .limit(1);

      if (!balance) return;

      await tx
        .update(customerBalances)
        .set({ remainingCount: balance.remainingCount + restoreQty })
        .where(eq(customerBalances.id, balance.id));

      const [refundTxn] = await tx
        .insert(balanceTransactions)
        .values({
          customerBalanceId: balance.id,
          type: 'refund',
          quantity: restoreQty,
          orderId,
          notes: `Refund restoration for order ${orderId}`,
        })
        .returning();

      results.push(refundTxn);
    });
  }

  return results;
}

// ── Transaction history ───────────────────────────────

export async function listTransactionHistory(customerId: string) {
  // Get all balance IDs for this customer
  const balances = await db
    .select({ id: customerBalances.id, packId: customerBalances.packId })
    .from(customerBalances)
    .where(eq(customerBalances.customerId, customerId));

  if (balances.length === 0) return [];

  const balanceIds = balances.map((b) => b.id);

  // Get all transactions for these balances
  const txns = await db
    .select({
      id: balanceTransactions.id,
      customerBalanceId: balanceTransactions.customerBalanceId,
      type: balanceTransactions.type,
      quantity: balanceTransactions.quantity,
      orderId: balanceTransactions.orderId,
      notes: balanceTransactions.notes,
      createdAt: balanceTransactions.createdAt,
      packName: prepaidPacks.name,
    })
    .from(balanceTransactions)
    .innerJoin(customerBalances, eq(balanceTransactions.customerBalanceId, customerBalances.id))
    .innerJoin(prepaidPacks, eq(customerBalances.packId, prepaidPacks.id))
    .where(
      balanceIds.length === 1
        ? eq(balanceTransactions.customerBalanceId, balanceIds[0])
        : eq(customerBalances.customerId, customerId),
    );

  return txns;
}
