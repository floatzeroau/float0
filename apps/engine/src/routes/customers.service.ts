import { eq, and, or, isNull, ilike, sql, desc, asc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { customers, customerBalances, orders, orderItems, prepaidPacks } from '../db/schema/pos.js';

export async function listCustomers(
  orgId: string,
  opts: {
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  },
) {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const offset = (page - 1) * limit;
  const sortDir = opts.dir === 'desc' ? desc : asc;

  // Base conditions
  const conditions = [eq(customers.organizationId, orgId), isNull(customers.deletedAt)];

  if (opts.search?.trim()) {
    const term = `%${opts.search.trim()}%`;
    conditions.push(
      or(
        ilike(customers.firstName, term),
        ilike(customers.lastName, term),
        ilike(customers.email, term),
        ilike(customers.phone, term),
        sql`(${customers.firstName} || ' ' || ${customers.lastName}) ILIKE ${term}`,
      )!,
    );
  }

  const where = and(...conditions);

  // Sort mapping
  const sortColumn = (() => {
    switch (opts.sort) {
      case 'totalSpent':
        return sql`COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), 0)`;
      case 'visitCount':
        return sql`COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), 0)`;
      case 'lastVisit':
        return sql`COALESCE((SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), '1970-01-01')`;
      default:
        return sql`(${customers.firstName} || ' ' || ${customers.lastName})`;
    }
  })();

  // Get total count
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(where);

  const total = countResult?.count ?? 0;

  // Get customers with computed fields
  const rows = await db
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
      deletedAt: customers.deletedAt,
      totalSpent: sql<number>`COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), 0)`,
      visitCount: sql<number>`COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), 0)::int`,
      lastVisit: sql<
        string | null
      >`(SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL)`,
      coffeeBalance: sql<number>`COALESCE((SELECT SUM(cb.remaining_count) FROM customer_balances cb WHERE cb.customer_id = ${customers.id} AND cb.remaining_count > 0), 0)::int`,
    })
    .from(customers)
    .where(where)
    .orderBy(sortDir(sortColumn))
    .limit(limit)
    .offset(offset);

  const data = rows.map((r) => ({
    ...r,
    status: r.deletedAt ? 'inactive' : 'active',
  }));

  return { data, total, page, limit };
}

export async function getCustomer(orgId: string, customerId: string) {
  const [customer] = await db
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      email: customers.email,
      phone: customers.phone,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
      deletedAt: customers.deletedAt,
      totalSpent: sql<number>`COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), 0)`,
      visitCount: sql<number>`COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), 0)::int`,
      lastVisit: sql<
        string | null
      >`(SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL)`,
      coffeeBalance: sql<number>`COALESCE((SELECT SUM(cb.remaining_count) FROM customer_balances cb WHERE cb.customer_id = ${customers.id} AND cb.remaining_count > 0), 0)::int`,
    })
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

  // Get active balances
  const balances = await db
    .select({
      id: customerBalances.id,
      packId: customerBalances.packId,
      remainingCount: customerBalances.remainingCount,
      originalCount: customerBalances.originalCount,
      pricePaid: customerBalances.pricePaid,
      purchasedAt: customerBalances.purchasedAt,
      packName: prepaidPacks.name,
    })
    .from(customerBalances)
    .leftJoin(prepaidPacks, eq(customerBalances.packId, prepaidPacks.id))
    .where(
      and(eq(customerBalances.customerId, customerId), sql`${customerBalances.remainingCount} > 0`),
    );

  // Get recent orders (last 10)
  const recentOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderType: orders.orderType,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
      itemCount: sql<number>`COALESCE((SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = ${orders.id} AND oi.deleted_at IS NULL), 0)::int`,
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), isNull(orders.deletedAt)))
    .orderBy(desc(orders.createdAt))
    .limit(10);

  return {
    ...customer,
    status: customer.deletedAt ? 'inactive' : 'active',
    balances,
    recentOrders,
  };
}

export async function createCustomer(
  orgId: string,
  data: {
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
  },
) {
  // Check for duplicate email if provided
  if (data.email) {
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.organizationId, orgId),
          eq(customers.email, data.email),
          isNull(customers.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      throw Object.assign(new Error('A customer with this email already exists'), {
        statusCode: 409,
      });
    }
  }

  const [customer] = await db
    .insert(customers)
    .values({
      organizationId: orgId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? null,
      phone: data.phone ?? null,
    })
    .returning();

  return customer;
}

export async function updateCustomer(
  orgId: string,
  customerId: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string | null;
    phone?: string | null;
  },
) {
  // Ensure customer exists
  const [existing] = await db
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

  if (!existing) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  // Check for duplicate email if changing
  if (data.email) {
    const [dup] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.organizationId, orgId),
          eq(customers.email, data.email),
          isNull(customers.deletedAt),
          sql`${customers.id} != ${customerId}`,
        ),
      )
      .limit(1);

    if (dup) {
      throw Object.assign(new Error('A customer with this email already exists'), {
        statusCode: 409,
      });
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.firstName !== undefined) updates.firstName = data.firstName;
  if (data.lastName !== undefined) updates.lastName = data.lastName;
  if (data.email !== undefined) updates.email = data.email;
  if (data.phone !== undefined) updates.phone = data.phone;

  const [updated] = await db
    .update(customers)
    .set(updates)
    .where(eq(customers.id, customerId))
    .returning();

  return updated;
}

export async function deactivateCustomer(orgId: string, customerId: string) {
  const [existing] = await db
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

  if (!existing) {
    throw Object.assign(new Error('Customer not found'), { statusCode: 404 });
  }

  await db
    .update(customers)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(customers.id, customerId));
}

export async function getPackCustomerCounts(orgId: string) {
  const rows = await db
    .select({
      packId: customerBalances.packId,
      customerCount: sql<number>`COUNT(DISTINCT ${customerBalances.customerId})::int`,
    })
    .from(customerBalances)
    .where(eq(customerBalances.organizationId, orgId))
    .groupBy(customerBalances.packId);

  return Object.fromEntries(rows.map((r) => [r.packId, r.customerCount]));
}
