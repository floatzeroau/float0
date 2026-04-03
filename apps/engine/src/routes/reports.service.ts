import { eq, and, sql, gte, lt, desc } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { orders, orderItems, payments, products, categories } from '../db/schema/pos.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SalesSummary {
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  totalGst: number;
  totalDiscount: number;
  totalTips: number;
}

interface PaymentMethodBreakdown {
  method: string;
  amount: number;
  count: number;
}

interface ProductSales {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
}

interface CategorySales {
  categoryId: string;
  categoryName: string;
  revenue: number;
  orderCount: number;
}

export interface SalesReport {
  summary: SalesSummary;
  byPaymentMethod: PaymentMethodBreakdown[];
  byProduct: ProductSales[];
  byCategory: CategorySales[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateRange(from: string, to: string, timezone: string) {
  const start = sql`(${from}::date AT TIME ZONE ${timezone})`;
  const end = sql`((${to}::date + interval '1 day') AT TIME ZONE ${timezone})`;
  return { start, end };
}

// ---------------------------------------------------------------------------
// Sales report query
// ---------------------------------------------------------------------------

export async function getSalesReport(
  orgId: string,
  from: string,
  to: string,
  timezone: string,
): Promise<SalesReport> {
  const { start, end } = dateRange(from, to, timezone);

  const completedOrderFilter = and(
    eq(orders.organizationId, orgId),
    eq(orders.status, 'completed'),
    gte(orders.createdAt, start),
    lt(orders.createdAt, end),
  );

  // ── Summary ─────────────────────────────────────────
  const [summary] = await db
    .select({
      totalRevenue: sql<number>`coalesce(sum(${orders.total}), 0)`,
      orderCount: sql<number>`cast(count(*) as int)`,
      totalGst: sql<number>`coalesce(sum(${orders.gst}), 0)`,
      totalDiscount: sql<number>`coalesce(sum(${orders.discountAmount}), 0)`,
    })
    .from(orders)
    .where(completedOrderFilter);

  const totalRevenue = Number(summary.totalRevenue);
  const orderCount = Number(summary.orderCount);

  // Tips from payments
  const [tipResult] = await db
    .select({
      totalTips: sql<number>`coalesce(sum(${payments.tipAmount}), 0)`,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(payments.organizationId, orgId),
        eq(payments.status, 'completed'),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    );

  // ── By payment method ───────────────────────────────
  const byPaymentMethod = await db
    .select({
      method: payments.method,
      amount: sql<number>`coalesce(sum(${payments.amount}), 0)`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(
      and(
        eq(payments.organizationId, orgId),
        eq(payments.status, 'completed'),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    )
    .groupBy(payments.method);

  // ── By product (top 20) ─────────────────────────────
  const byProduct = await db
    .select({
      productId: products.id,
      productName: products.name,
      quantity: sql<number>`cast(sum(${orderItems.quantity}) as int)`,
      revenue: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)`,
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
    .orderBy(desc(sql`sum(${orderItems.lineTotal})`))
    .limit(20);

  // ── By category ─────────────────────────────────────
  const byCategory = await db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      revenue: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)`,
      orderCount: sql<number>`cast(count(distinct ${orders.id}) as int)`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .innerJoin(products, eq(orderItems.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(orders.organizationId, orgId),
        eq(orders.status, 'completed'),
        gte(orders.createdAt, start),
        lt(orders.createdAt, end),
      ),
    )
    .groupBy(categories.id, categories.name)
    .orderBy(desc(sql`sum(${orderItems.lineTotal})`));

  return {
    summary: {
      totalRevenue,
      orderCount,
      averageOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
      totalGst: Number(summary.totalGst),
      totalDiscount: Number(summary.totalDiscount),
      totalTips: Number(tipResult.totalTips),
    },
    byPaymentMethod: byPaymentMethod.map((r) => ({
      method: r.method,
      amount: Number(r.amount),
      count: Number(r.count),
    })),
    byProduct: byProduct.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      quantity: Number(r.quantity),
      revenue: Number(r.revenue),
    })),
    byCategory: byCategory.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      revenue: Number(r.revenue),
      orderCount: Number(r.orderCount),
    })),
  };
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export function salesReportToCsv(report: SalesReport, from: string, to: string): string {
  const lines: string[] = [];

  lines.push(`Sales Report: ${from} to ${to}`);
  lines.push('');

  // Summary
  lines.push('Summary');
  lines.push('Metric,Value');
  lines.push(`Total Revenue,${report.summary.totalRevenue.toFixed(2)}`);
  lines.push(`Order Count,${report.summary.orderCount}`);
  lines.push(`Average Order Value,${report.summary.averageOrderValue.toFixed(2)}`);
  lines.push(`Total GST,${report.summary.totalGst.toFixed(2)}`);
  lines.push(`Total Discounts,${report.summary.totalDiscount.toFixed(2)}`);
  lines.push(`Total Tips,${report.summary.totalTips.toFixed(2)}`);
  lines.push('');

  // By payment method
  lines.push('Sales by Payment Method');
  lines.push('Method,Amount,Transactions');
  for (const pm of report.byPaymentMethod) {
    lines.push(`${pm.method},${pm.amount.toFixed(2)},${pm.count}`);
  }
  lines.push('');

  // By product
  lines.push('Sales by Product');
  lines.push('Product,Quantity,Revenue');
  for (const p of report.byProduct) {
    lines.push(`"${p.productName.replace(/"/g, '""')}",${p.quantity},${p.revenue.toFixed(2)}`);
  }
  lines.push('');

  // By category
  lines.push('Sales by Category');
  lines.push('Category,Revenue,Orders');
  for (const c of report.byCategory) {
    lines.push(`"${c.categoryName.replace(/"/g, '""')}",${c.revenue.toFixed(2)},${c.orderCount}`);
  }

  return lines.join('\n');
}
