import { eq, and, sql, desc, isNull, gte, lt, ilike, or, inArray } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { orders, orderItems, payments, products, customers } from '../db/schema/pos.js';
import { orgMemberships, users } from '../db/schema/core.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ListOrdersParams {
  orgId: string;
  page: number;
  limit: number;
  status?: string;
  orderType?: string;
  search?: string;
  from?: string;
  to?: string;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  tableNumber: string | null;
  subtotal: number;
  gst: number;
  total: number;
  discountAmount: number;
  notes: string | null;
  createdAt: Date;
  customerName: string | null;
  staffName: string | null;
  paymentMethod: string | null;
  itemCount: number;
}

// ---------------------------------------------------------------------------
// List orders (paginated)
// ---------------------------------------------------------------------------

export async function listOrders(params: ListOrdersParams) {
  const { orgId, page, limit, status, orderType, search, from, to } = params;
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const conditions = [eq(orders.organizationId, orgId), isNull(orders.deletedAt)];

  // Exclude empty draft orders ($0 total) unless explicitly filtering for drafts
  if (status !== 'draft') {
    conditions.push(sql`NOT (${orders.status} = 'draft' AND ${orders.total} = 0)`);
  }

  if (status) {
    conditions.push(eq(orders.status, status as any));
  }

  if (orderType) {
    conditions.push(eq(orders.orderType, orderType as any));
  }

  if (from) {
    conditions.push(gte(orders.createdAt, sql`${from}::timestamptz`));
  }

  if (to) {
    conditions.push(lt(orders.createdAt, sql`(${to}::date + interval '1 day')::timestamptz`));
  }

  if (search) {
    conditions.push(
      or(
        ilike(orders.orderNumber, `%${search}%`),
        sql`exists (
          select 1 from customers c
          where c.id = ${orders.customerId}
          and (c.first_name ilike ${`%${search}%`} or c.last_name ilike ${`%${search}%`})
        )`,
      )!,
    );
  }

  const where = and(...conditions);

  // Count
  const [{ total: totalCount }] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(where);

  // Fetch orders
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderType: orders.orderType,
      status: orders.status,
      tableNumber: orders.tableNumber,
      subtotal: orders.subtotal,
      gst: orders.gst,
      total: orders.total,
      discountAmount: orders.discountAmount,
      notes: orders.notes,
      createdAt: orders.createdAt,
      customerId: orders.customerId,
      staffId: orders.staffId,
      itemCount: sql<number>`(select cast(count(*) as int) from order_items oi where oi.order_id = ${orders.id} and oi.deleted_at is null)`,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(offset);

  // Batch-fetch staff names, customer names, payment methods
  const staffIds = [...new Set(rows.map((r) => r.staffId).filter(Boolean))];
  const customerIds = [
    ...new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id)),
  ];
  const orderIds = rows.map((r) => r.id);

  const staffMap = new Map<string, string>();
  const customerMap = new Map<string, string>();
  const paymentMap = new Map<string, string>();

  if (staffIds.length > 0) {
    const staffRows = await db
      .select({
        id: orgMemberships.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(orgMemberships)
      .innerJoin(users, eq(orgMemberships.userId, users.id))
      .where(inArray(orgMemberships.id, staffIds));
    for (const s of staffRows) {
      staffMap.set(s.id, `${s.firstName} ${s.lastName}`.trim());
    }
  }

  if (customerIds.length > 0) {
    const custRows = await db
      .select({ id: customers.id, firstName: customers.firstName, lastName: customers.lastName })
      .from(customers)
      .where(sql`${customers.id} in ${customerIds}`);
    for (const c of custRows) {
      customerMap.set(c.id, `${c.firstName} ${c.lastName}`.trim());
    }
  }

  if (orderIds.length > 0) {
    const payRows = await db
      .select({ orderId: payments.orderId, method: payments.method })
      .from(payments)
      .where(
        and(
          eq(payments.organizationId, orgId),
          sql`${payments.orderId} in ${orderIds}`,
          eq(payments.status, 'completed'),
        ),
      );
    for (const p of payRows) {
      if (!paymentMap.has(p.orderId)) {
        paymentMap.set(p.orderId, p.method);
      }
    }
  }

  const data: OrderRow[] = rows.map((r) => ({
    id: r.id,
    orderNumber: r.orderNumber,
    orderType: r.orderType,
    status: r.status,
    tableNumber: r.tableNumber,
    subtotal: r.subtotal,
    gst: r.gst,
    total: r.total,
    discountAmount: r.discountAmount,
    notes: r.notes,
    createdAt: r.createdAt,
    customerName: r.customerId ? (customerMap.get(r.customerId) ?? null) : null,
    staffName: staffMap.get(r.staffId) ?? null,
    paymentMethod: paymentMap.get(r.id) ?? null,
    itemCount: Number(r.itemCount),
  }));

  return {
    data,
    pagination: {
      page,
      limit,
      total: Number(totalCount),
      totalPages: Math.ceil(Number(totalCount) / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// Get single order with items
// ---------------------------------------------------------------------------

export async function getOrder(orgId: string, id: string) {
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderType: orders.orderType,
      status: orders.status,
      tableNumber: orders.tableNumber,
      subtotal: orders.subtotal,
      gst: orders.gst,
      total: orders.total,
      discountAmount: orders.discountAmount,
      notes: orders.notes,
      staffId: orders.staffId,
      customerId: orders.customerId,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.organizationId, orgId), isNull(orders.deletedAt)));

  if (!order) return null;

  // Fetch items with product names
  const items = await db
    .select({
      id: orderItems.id,
      productName: products.name,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      lineTotal: orderItems.lineTotal,
      modifiersJson: orderItems.modifiersJson,
      notes: orderItems.notes,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(and(eq(orderItems.orderId, id), isNull(orderItems.deletedAt)));

  // Staff name (staffId references orgMemberships.id, not users.id)
  let staffName: string | null = null;
  if (order.staffId) {
    const [staff] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(orgMemberships)
      .innerJoin(users, eq(orgMemberships.userId, users.id))
      .where(eq(orgMemberships.id, order.staffId));
    if (staff) staffName = `${staff.firstName} ${staff.lastName}`.trim();
  }

  // Customer name
  let customerName: string | null = null;
  if (order.customerId) {
    const [cust] = await db
      .select({ firstName: customers.firstName, lastName: customers.lastName })
      .from(customers)
      .where(eq(customers.id, order.customerId));
    if (cust) customerName = `${cust.firstName} ${cust.lastName}`.trim();
  }

  // Payment
  const paymentRows = await db
    .select({
      method: payments.method,
      amount: payments.amount,
      status: payments.status,
    })
    .from(payments)
    .where(and(eq(payments.orderId, id), eq(payments.organizationId, orgId)));

  return {
    ...order,
    staffName,
    customerName,
    items,
    payments: paymentRows,
  };
}

// ---------------------------------------------------------------------------
// Void an order (soft-delete: sets status to 'voided')
// ---------------------------------------------------------------------------

export async function voidOrder(
  orgId: string,
  id: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  const [order] = await db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.organizationId, orgId), isNull(orders.deletedAt)));

  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  if (order.status === 'voided' || order.status === 'cancelled') {
    return { success: false, error: 'Order is already voided or cancelled' };
  }

  await db
    .update(orders)
    .set({
      status: 'voided' as any,
      notes: reason || null,
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, id), eq(orders.organizationId, orgId)));

  return { success: true };
}
