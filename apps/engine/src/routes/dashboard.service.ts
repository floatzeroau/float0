import { eq, and, sql, desc, gte, lt } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { orders, orderItems, payments, products } from '../db/schema/pos.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SalesByHour {
  hour: number;
  revenue: number;
  orders: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  total: number;
  paymentMethod: string | null;
  createdAt: Date;
}

interface DashboardSummary {
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
  totalSalesYesterday: number;
  orderCountYesterday: number;
  averageOrderValueYesterday: number;
  topProduct: { name: string; quantity: number } | null;
  salesByHour: SalesByHour[];
  recentOrders: RecentOrder[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dayRange(date: string, timezone: string) {
  const start = sql`(${date}::date AT TIME ZONE ${timezone})`;
  const end = sql`((${date}::date + interval '1 day') AT TIME ZONE ${timezone})`;
  return { start, end };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function getDashboardSummary(
  orgId: string,
  date: string,
  timezone: string,
): Promise<DashboardSummary> {
  const { start, end } = dayRange(date, timezone);

  // Yesterday range
  const yesterday = sql`(${date}::date - interval '1 day')::date`;
  const yesterdayRange = {
    start: sql`(${yesterday} AT TIME ZONE ${timezone})`,
    end: sql`((${yesterday} + interval '1 day') AT TIME ZONE ${timezone})`,
  };

  // ── Today totals ──────────────────────────────────────
  const [todayTotals] = await db
    .select({
      totalSales: sql<number>`coalesce(sum(${orders.total}), 0)`,
      orderCount: sql<number>`cast(count(*) as int)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, orgId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    );

  // ── Yesterday totals ──────────────────────────────────
  const [yesterdayTotals] = await db
    .select({
      totalSales: sql<number>`coalesce(sum(${orders.total}), 0)`,
      orderCount: sql<number>`cast(count(*) as int)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, orgId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, yesterdayRange.start),
        lt(orders.createdAt, yesterdayRange.end),
      ),
    );

  // ── Top product ───────────────────────────────────────
  const topProductRows = await db
    .select({
      name: products.name,
      quantity: sql<number>`cast(sum(${orderItems.quantity}) as int)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(
      and(
        eq(orders.organizationId, orgId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    )
    .groupBy(products.id, products.name)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(1);

  // ── Sales by hour ─────────────────────────────────────
  const salesByHourRows = await db
    .select({
      hour: sql<number>`cast(extract(hour from ${orders.createdAt} AT TIME ZONE ${timezone}) as int)`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
      orders: sql<number>`cast(count(*) as int)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, orgId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    )
    .groupBy(sql`extract(hour from ${orders.createdAt} AT TIME ZONE ${timezone})`)
    .orderBy(sql`extract(hour from ${orders.createdAt} AT TIME ZONE ${timezone})`);

  // ── Recent orders ─────────────────────────────────────
  const recentOrderRows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      orderType: orders.orderType,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, orgId),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(10);

  // Fetch payment methods for recent orders
  const orderIds = recentOrderRows.map((o) => o.id);
  const paymentMap = new Map<string, string>();

  if (orderIds.length > 0) {
    const paymentRows = await db
      .select({
        orderId: payments.orderId,
        method: payments.method,
      })
      .from(payments)
      .where(
        and(
          eq(payments.organizationId, orgId),
          sql`${payments.orderId} = ANY(${orderIds})`,
          eq(payments.status, 'completed'),
        ),
      );

    for (const p of paymentRows) {
      if (!paymentMap.has(p.orderId)) {
        paymentMap.set(p.orderId, p.method);
      }
    }
  }

  const recentOrders: RecentOrder[] = recentOrderRows.map((o) => ({
    ...o,
    paymentMethod: paymentMap.get(o.id) ?? null,
  }));

  // ── Assemble ──────────────────────────────────────────
  const totalSales = Number(todayTotals.totalSales);
  const orderCount = Number(todayTotals.orderCount);
  const totalSalesYesterday = Number(yesterdayTotals.totalSales);
  const orderCountYesterday = Number(yesterdayTotals.orderCount);

  return {
    totalSales,
    orderCount,
    averageOrderValue: orderCount > 0 ? totalSales / orderCount : 0,
    totalSalesYesterday,
    orderCountYesterday,
    averageOrderValueYesterday:
      orderCountYesterday > 0 ? totalSalesYesterday / orderCountYesterday : 0,
    topProduct: topProductRows[0] ?? null,
    salesByHour: salesByHourRows.map((r) => ({
      hour: Number(r.hour),
      revenue: Number(r.revenue),
      orders: Number(r.orders),
    })),
    recentOrders,
  };
}
