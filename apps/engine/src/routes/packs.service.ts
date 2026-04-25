import { eq, and, isNull, desc, lt, sql } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  packs,
  packServeRecords,
  packTransactions,
  products,
  customers,
} from '../db/schema/pos.js';
import { organizations } from '../db/schema/core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyCustomerInOrg(orgId: string, customerId: string) {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.id, customerId),
        eq(customers.organizationId, orgId),
        isNull(customers.deletedAt),
      ),
    )
    .limit(1);

  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  return customer;
}

async function getOrgSettings(orgId: string) {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return (org?.settings ?? {}) as Record<string, unknown>;
}

function assertCafePackEnabled(settings: Record<string, unknown>) {
  const cafePack = settings.cafePack as { enabled?: boolean } | undefined;
  if (!cafePack?.enabled) {
    throw Object.assign(new Error('Cafe Pack feature is not enabled for this organization'), {
      statusCode: 403,
    });
  }
}

// ---------------------------------------------------------------------------
// On-read expiry check
// ---------------------------------------------------------------------------

async function expireOverduePacks(orgId: string, customerId: string) {
  await db
    .update(packs)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        eq(packs.organizationId, orgId),
        eq(packs.customerId, customerId),
        eq(packs.status, 'active'),
        lt(packs.expiryDate, new Date()),
      ),
    );
}

// ---------------------------------------------------------------------------
// List packs
// ---------------------------------------------------------------------------

export async function listCustomerPacks(orgId: string, customerId: string, statusFilter?: string) {
  await verifyCustomerInOrg(orgId, customerId);
  await expireOverduePacks(orgId, customerId);

  const conditions = [
    eq(packs.organizationId, orgId),
    eq(packs.customerId, customerId),
    isNull(packs.deletedAt),
  ];

  if (statusFilter) {
    conditions.push(
      eq(packs.status, statusFilter as 'active' | 'expired' | 'consumed' | 'refunded'),
    );
  } else {
    conditions.push(eq(packs.status, 'active'));
  }

  return db
    .select({
      id: packs.id,
      productId: packs.productId,
      productSnapshot: packs.productSnapshot,
      totalQuantity: packs.totalQuantity,
      remainingQuantity: packs.remainingQuantity,
      pricePaid: packs.pricePaid,
      unitValue: packs.unitValue,
      expiryDate: packs.expiryDate,
      status: packs.status,
      sourceOrderId: packs.sourceOrderId,
      purchasedAt: packs.purchasedAt,
    })
    .from(packs)
    .where(and(...conditions))
    .orderBy(desc(packs.purchasedAt));
}

// ---------------------------------------------------------------------------
// Create pack
// ---------------------------------------------------------------------------

export async function createPack(
  orgId: string,
  customerId: string,
  data: {
    productId: string;
    productSnapshot: unknown;
    totalQuantity: number;
    pricePaid: number;
    sourceOrderId?: string;
    expiryDate?: string;
  },
  staffId?: string,
) {
  await verifyCustomerInOrg(orgId, customerId);

  // Validate product exists and is pack-eligible
  const [product] = await db
    .select({ id: products.id, allowAsPack: products.allowAsPack })
    .from(products)
    .where(
      and(
        eq(products.id, data.productId),
        eq(products.organizationId, orgId),
        isNull(products.deletedAt),
      ),
    )
    .limit(1);

  if (!product) {
    throw Object.assign(new Error('Product not found'), { statusCode: 404 });
  }

  if (!product.allowAsPack) {
    throw Object.assign(new Error('Product is not eligible for pack purchase'), {
      statusCode: 400,
    });
  }

  const unitValue = data.pricePaid / data.totalQuantity;

  const result = await db.transaction(async (tx) => {
    const [pack] = await tx
      .insert(packs)
      .values({
        organizationId: orgId,
        customerId,
        productId: data.productId,
        productSnapshot: data.productSnapshot,
        totalQuantity: data.totalQuantity,
        remainingQuantity: data.totalQuantity,
        pricePaid: data.pricePaid,
        unitValue,
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        status: 'active',
        sourceOrderId: data.sourceOrderId ?? null,
      })
      .returning();

    await tx.insert(packTransactions).values({
      organizationId: orgId,
      packId: pack.id,
      type: 'purchase',
      quantity: data.totalQuantity,
      amount: data.pricePaid,
      referenceId: data.sourceOrderId ?? null,
      staffId: staffId ?? null,
      notes: `Purchased ${data.totalQuantity}x pack`,
    });

    return pack;
  });

  return result;
}

// ---------------------------------------------------------------------------
// Serve
// ---------------------------------------------------------------------------

export async function servePack(
  orgId: string,
  customerId: string,
  packId: string,
  data: {
    quantityServed?: number;
    terminalId?: string;
  },
  staffId?: string,
) {
  // Check feature flag
  const settings = await getOrgSettings(orgId);
  assertCafePackEnabled(settings);

  await verifyCustomerInOrg(orgId, customerId);

  const qty = data.quantityServed ?? 1;

  const [pack] = await db
    .select()
    .from(packs)
    .where(
      and(
        eq(packs.id, packId),
        eq(packs.organizationId, orgId),
        eq(packs.customerId, customerId),
        isNull(packs.deletedAt),
      ),
    )
    .limit(1);

  if (!pack) {
    throw Object.assign(new Error('Pack not found'), { statusCode: 404 });
  }

  // Check expiry
  if (pack.expiryDate && new Date(pack.expiryDate) < new Date()) {
    // Auto-expire
    await db
      .update(packs)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(packs.id, packId));
    throw Object.assign(new Error('Pack has expired'), { statusCode: 400 });
  }

  if (pack.status !== 'active') {
    throw Object.assign(new Error(`Pack is ${pack.status}, cannot serve`), { statusCode: 400 });
  }

  if (pack.remainingQuantity < qty) {
    throw Object.assign(new Error('Insufficient remaining quantity'), { statusCode: 400 });
  }

  const newRemaining = pack.remainingQuantity - qty;
  const newStatus = newRemaining === 0 ? 'consumed' : 'active';

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(packs)
      .set({
        remainingQuantity: newRemaining,
        status: newStatus as 'active' | 'consumed',
        updatedAt: new Date(),
        _version: pack._version + 1,
      })
      .where(eq(packs.id, packId))
      .returning();

    const [serveRecord] = await tx
      .insert(packServeRecords)
      .values({
        organizationId: orgId,
        customerId,
        packId,
        productSnapshot: pack.productSnapshot,
        quantityServed: qty,
        baristaId: staffId ?? null,
        terminalId: data.terminalId ?? null,
      })
      .returning();

    await tx.insert(packTransactions).values({
      organizationId: orgId,
      packId,
      type: 'serve',
      quantity: -qty,
      referenceId: serveRecord.id,
      staffId: staffId ?? null,
      notes: `Served ${qty}x`,
    });

    return { pack: updated, serveRecord };
  });

  return result;
}

// ---------------------------------------------------------------------------
// Refund
// ---------------------------------------------------------------------------

export async function refundPack(
  orgId: string,
  customerId: string,
  packId: string,
  staffId?: string,
) {
  await verifyCustomerInOrg(orgId, customerId);

  const [pack] = await db
    .select()
    .from(packs)
    .where(
      and(
        eq(packs.id, packId),
        eq(packs.organizationId, orgId),
        eq(packs.customerId, customerId),
        isNull(packs.deletedAt),
      ),
    )
    .limit(1);

  if (!pack) {
    throw Object.assign(new Error('Pack not found'), { statusCode: 404 });
  }

  if (pack.status === 'refunded') {
    throw Object.assign(new Error('Pack is already refunded'), { statusCode: 400 });
  }

  const remainingValue = pack.unitValue * pack.remainingQuantity;

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(packs)
      .set({
        status: 'refunded',
        remainingQuantity: 0,
        updatedAt: new Date(),
        _version: pack._version + 1,
      })
      .where(eq(packs.id, packId))
      .returning();

    await tx.insert(packTransactions).values({
      organizationId: orgId,
      packId,
      type: 'refund',
      quantity: -pack.remainingQuantity,
      amount: remainingValue,
      referenceId: pack.sourceOrderId ?? null,
      staffId: staffId ?? null,
      notes: `Refunded ${pack.remainingQuantity} remaining (value: $${remainingValue.toFixed(2)})`,
    });

    return { pack: updated, remainingValue };
  });

  return result;
}

// ---------------------------------------------------------------------------
// Adjust (admin)
// ---------------------------------------------------------------------------

export async function adjustPack(
  orgId: string,
  customerId: string,
  packId: string,
  data: { quantityDelta: number; reason: string },
  staffId?: string,
) {
  await verifyCustomerInOrg(orgId, customerId);

  const [pack] = await db
    .select()
    .from(packs)
    .where(
      and(
        eq(packs.id, packId),
        eq(packs.organizationId, orgId),
        eq(packs.customerId, customerId),
        isNull(packs.deletedAt),
      ),
    )
    .limit(1);

  if (!pack) {
    throw Object.assign(new Error('Pack not found'), { statusCode: 404 });
  }

  const newRemaining = pack.remainingQuantity + data.quantityDelta;
  if (newRemaining < 0) {
    throw Object.assign(new Error('Adjustment would result in negative quantity'), {
      statusCode: 400,
    });
  }

  // If adjusting up from consumed/expired, reactivate
  let newStatus = pack.status;
  if (newRemaining > 0 && (pack.status === 'consumed' || pack.status === 'expired')) {
    newStatus = 'active';
  } else if (newRemaining === 0 && pack.status === 'active') {
    newStatus = 'consumed';
  }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(packs)
      .set({
        remainingQuantity: newRemaining,
        status: newStatus,
        updatedAt: new Date(),
        _version: pack._version + 1,
      })
      .where(eq(packs.id, packId))
      .returning();

    await tx.insert(packTransactions).values({
      organizationId: orgId,
      packId,
      type: 'admin_adjust',
      quantity: data.quantityDelta,
      staffId: staffId ?? null,
      notes: data.reason,
    });

    return updated;
  });

  return result;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function listPackHistory(
  orgId: string,
  customerId: string,
  opts: { page?: number; limit?: number },
) {
  await verifyCustomerInOrg(orgId, customerId);

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 50;
  const offset = (page - 1) * limit;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(packTransactions)
    .innerJoin(packs, eq(packTransactions.packId, packs.id))
    .where(and(eq(packs.customerId, customerId), eq(packs.organizationId, orgId)));

  const total = countResult?.count ?? 0;

  const rows = await db
    .select({
      id: packTransactions.id,
      packId: packTransactions.packId,
      type: packTransactions.type,
      quantity: packTransactions.quantity,
      amount: packTransactions.amount,
      referenceId: packTransactions.referenceId,
      staffId: packTransactions.staffId,
      notes: packTransactions.notes,
      createdAt: packTransactions.createdAt,
      productSnapshot: packs.productSnapshot,
    })
    .from(packTransactions)
    .innerJoin(packs, eq(packTransactions.packId, packs.id))
    .where(and(eq(packs.customerId, customerId), eq(packs.organizationId, orgId)))
    .orderBy(desc(packTransactions.createdAt))
    .limit(limit)
    .offset(offset);

  return { data: rows, total, page, limit };
}
