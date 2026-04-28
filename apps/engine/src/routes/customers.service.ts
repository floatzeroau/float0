import { eq, and, or, isNull, ilike, sql, desc, asc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { customers, orders, packs } from '../db/schema/pos.js';
import { organizations } from '../db/schema/core.js';

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
      passwordHash: customers.passwordHash,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
      deletedAt: customers.deletedAt,
      totalSpent: sql<number>`COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), 0)`,
      visitCount: sql<number>`COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), 0)::int`,
      lastVisit: sql<
        string | null
      >`(SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL)`,
      activePackCount: sql<number>`COALESCE((SELECT COUNT(*) FROM packs p WHERE p.customer_id = ${customers.id} AND p.status = 'active'), 0)::int`,
    })
    .from(customers)
    .where(where)
    .orderBy(sortDir(sortColumn))
    .limit(limit)
    .offset(offset);

  const data = rows.map(({ passwordHash, ...rest }) => ({
    ...rest,
    status: rest.deletedAt ? 'inactive' : 'active',
    hasPortalAccess: !!passwordHash,
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
      passwordHash: customers.passwordHash,
      createdAt: customers.createdAt,
      updatedAt: customers.updatedAt,
      deletedAt: customers.deletedAt,
      totalSpent: sql<number>`COALESCE((SELECT SUM(o.total) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), 0)`,
      visitCount: sql<number>`COALESCE((SELECT COUNT(*) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL), 0)::int`,
      lastVisit: sql<
        string | null
      >`(SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = ${customers.id} AND o.status = 'completed' AND o.deleted_at IS NULL)`,
      activePackCount: sql<number>`COALESCE((SELECT COUNT(*) FROM packs p WHERE p.customer_id = ${customers.id} AND p.status = 'active'), 0)::int`,
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

  const { passwordHash, ...rest } = customer;
  return {
    ...rest,
    status: rest.deletedAt ? 'inactive' : 'active',
    hasPortalAccess: !!passwordHash,
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
      productId: packs.productId,
      customerCount: sql<number>`COUNT(DISTINCT ${packs.customerId})::int`,
    })
    .from(packs)
    .where(eq(packs.organizationId, orgId))
    .groupBy(packs.productId);

  return Object.fromEntries(rows.map((r) => [r.productId, r.customerCount]));
}

export async function enablePortalAccess(orgId: string, customerId: string, email?: string) {
  const [customer] = await db
    .select()
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

  // If customer has no email, one must be provided
  if (!customer.email && !email) {
    throw Object.assign(new Error('Customer has no email — email must be provided'), {
      statusCode: 400,
    });
  }

  // Set email if provided
  if (email && email !== customer.email) {
    await db
      .update(customers)
      .set({ email, updatedAt: new Date() })
      .where(eq(customers.id, customerId));
  }

  const finalEmail = email ?? customer.email!;

  // Get org slug for URL
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  return {
    customerId,
    email: finalEmail,
    orgSlug: org!.slug,
  };
}
