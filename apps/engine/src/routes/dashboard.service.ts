import { eq, and, sql, desc, gte, lt } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { orders, orderItems, products } from '../db/schema/pos.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// Hourly — 24 hours of the given date
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
    .groupBy(sql`extract(hour from ${orders.createdAt} AT TIME ZONE ${timezone})`)
    .orderBy(sql`extract(hour from ${orders.createdAt} AT TIME ZONE ${timezone})`);

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
// Daily — 7 days of the week containing the given date
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
    .groupBy(sql`extract(isodow from ${orders.createdAt} AT TIME ZONE ${timezone})`)
    .orderBy(sql`extract(isodow from ${orders.createdAt} AT TIME ZONE ${timezone})`);

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
// Weekly — weeks of the month containing the given date
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
    .groupBy(sql`ceil(extract(day from ${orders.createdAt} AT TIME ZONE ${timezone}) / 7.0)`)
    .orderBy(sql`ceil(extract(day from ${orders.createdAt} AT TIME ZONE ${timezone}) / 7.0)`);

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
// Public API
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
