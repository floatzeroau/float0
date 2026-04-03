import { eq, and, sql, desc, gte, lt, inArray } from 'drizzle-orm';
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

interface SalesPeriodEntry {
  label: string;
  revenue: number;
  orderCount: number;
}

interface SalesChartResponse {
  period: 'hourly' | 'daily' | 'weekly';
  data: SalesPeriodEntry[];
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
// Dashboard Summary (FLO-85)
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
    .groupBy(sql`1`)
    .orderBy(sql`1`);

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
          inArray(payments.orderId, orderIds),
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

// ---------------------------------------------------------------------------
// Sales Chart — Hourly (FLO-86)
// ---------------------------------------------------------------------------

async function getHourlySales(
  orgId: string,
  date: string,
  timezone: string,
): Promise<SalesPeriodEntry[]> {
  const { start, end } = dayRange(date, timezone);

  const rows = await db
    .select({
      hour: sql<number>`cast(extract(hour from ${orders.createdAt} AT TIME ZONE ${timezone}) as int)`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
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
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  // Fill all 24 hours
  const map = new Map(rows.map((r) => [Number(r.hour), r]));
  return Array.from({ length: 24 }, (_, h) => {
    const row = map.get(h);
    const suffix = h >= 12 ? 'pm' : 'am';
    const display = h % 12 || 12;
    return {
      label: `${display}${suffix}`,
      revenue: row ? Number(row.revenue) : 0,
      orderCount: row ? Number(row.orderCount) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Sales Chart — Daily (FLO-86)
// ---------------------------------------------------------------------------

async function getDailySales(
  orgId: string,
  date: string,
  timezone: string,
): Promise<SalesPeriodEntry[]> {
  // Monday of the week
  const weekStart = sql`date_trunc('week', ${date}::date)`;
  const weekEnd = sql`(date_trunc('week', ${date}::date) + interval '7 days')`;

  const rows = await db
    .select({
      dow: sql<number>`cast(extract(isodow from ${orders.createdAt} AT TIME ZONE ${timezone}) as int)`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
      orderCount: sql<number>`cast(count(*) as int)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, orgId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, sql`(${weekStart} AT TIME ZONE ${timezone})`),
        lt(orders.createdAt, sql`(${weekEnd} AT TIME ZONE ${timezone})`),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const map = new Map(rows.map((r) => [Number(r.dow), r]));

  return dayNames.map((name, i) => {
    const row = map.get(i + 1); // isodow is 1-based (Mon=1)
    return {
      label: name,
      revenue: row ? Number(row.revenue) : 0,
      orderCount: row ? Number(row.orderCount) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Sales Chart — Weekly (FLO-86)
// ---------------------------------------------------------------------------

async function getWeeklySales(
  orgId: string,
  date: string,
  timezone: string,
): Promise<SalesPeriodEntry[]> {
  const monthStart = sql`date_trunc('month', ${date}::date)`;
  const monthEnd = sql`(date_trunc('month', ${date}::date) + interval '1 month')`;

  const rows = await db
    .select({
      weekNum: sql<number>`cast(ceil(extract(day from ${orders.createdAt} AT TIME ZONE ${timezone}) / 7.0) as int)`,
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
      orderCount: sql<number>`cast(count(*) as int)`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, orgId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, sql`(${monthStart} AT TIME ZONE ${timezone})`),
        lt(orders.createdAt, sql`(${monthEnd} AT TIME ZONE ${timezone})`),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  // Up to 5 weeks in a month
  const map = new Map(rows.map((r) => [Number(r.weekNum), r]));
  const weekCount = Math.max(4, ...Array.from(map.keys()));

  return Array.from({ length: weekCount }, (_, i) => {
    const row = map.get(i + 1);
    return {
      label: `Week ${i + 1}`,
      revenue: row ? Number(row.revenue) : 0,
      orderCount: row ? Number(row.orderCount) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Sales Chart — Public API (FLO-86)
// ---------------------------------------------------------------------------

export async function getSalesChart(
  orgId: string,
  period: 'hourly' | 'daily' | 'weekly',
  date: string,
  timezone: string,
): Promise<SalesChartResponse> {
  let data: SalesPeriodEntry[];

  switch (period) {
    case 'hourly':
      data = await getHourlySales(orgId, date, timezone);
      break;
    case 'daily':
      data = await getDailySales(orgId, date, timezone);
      break;
    case 'weekly':
      data = await getWeeklySales(orgId, date, timezone);
      break;
  }

  return { period, data };
}
