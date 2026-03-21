import { Q } from '@nozbe/watermelondb';
import type { Database } from '@nozbe/watermelondb';
import type { Shift, Order, Payment, OrderItem, AuditLog, Staff, Product } from '../db/models';
import { getShiftCashMovementTotals } from '../db/queries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CashReconciliation {
  openingFloat: number;
  cashSales: number;
  cashRefunds: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  actualCash?: number;
  variance?: number;
}

export interface ShiftReportData {
  shiftId: string;
  staffName: string;
  openedAt: number;
  closedAt?: number;
  shiftDuration: string;
  salesByMethod: { cash: number; card: number; split: number };
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
  totalDiscounts: number;
  totalVoids: number;
  totalRefunds: number;
  totalTips: number;
  totalGst: number;
  cashReconciliation: CashReconciliation;
  topProducts: { name: string; quantity: number; revenue: number }[];
  drawerOpens: number;
}

export interface ZReportData {
  date: string;
  dailyRevenue: number;
  dailyOrderCount: number;
  dailyGstCollected: number;
  dailySalesByMethod: { cash: number; card: number; split: number };
  dailyTotalDiscounts: number;
  dailyTotalRefunds: number;
  dailyTotalTips: number;
  dailyTopProducts: { name: string; quantity: number; revenue: number }[];
  shifts: {
    shiftId: string;
    staffName: string;
    openedAt: number;
    closedAt: number;
    totalSales: number;
    orderCount: number;
    cashReconciliation: CashReconciliation;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

// ---------------------------------------------------------------------------
// Build Shift Report
// ---------------------------------------------------------------------------

export async function buildShiftReport(database: Database, shift: Shift): Promise<ShiftReportData> {
  // 1. Staff name
  let staffName = 'Unknown';
  try {
    const staff: Staff = await shift.staffMember.fetch();
    if (staff) staffName = `${staff.firstName} ${staff.lastName}`;
  } catch {
    // staff record may be missing
  }

  // 2. Time boundaries
  const openedAtMs = (shift._raw as any).opened_at as number;
  const closedAtMs = (shift._raw as any).closed_at as number | undefined;

  // 3. Query orders within shift window
  const orderClauses = [Q.where('created_at', Q.gte(openedAtMs))];
  if (closedAtMs) orderClauses.push(Q.where('created_at', Q.lte(closedAtMs)));
  const allOrders = await database
    .get<Order>('orders')
    .query(...orderClauses)
    .fetch();

  // Only completed / refunded orders count
  const orders = allOrders.filter((o) => o.status === 'completed' || o.status === 'refunded');
  const orderIds = orders.map((o) => o.id);

  // 4. Query payments
  const payments =
    orderIds.length > 0
      ? await database
          .get<Payment>('payments')
          .query(Q.where('order_id', Q.oneOf(orderIds)))
          .fetch()
      : [];

  // 5. Aggregate payments by method + detect splits
  let cashSales = 0;
  let cardSales = 0;
  let cashRefunds = 0;
  let totalTips = 0;
  const orderMethods: Record<string, Set<string>> = {};

  for (const p of payments) {
    if (!orderMethods[p.orderId]) orderMethods[p.orderId] = new Set();

    if (p.status === 'completed') {
      orderMethods[p.orderId].add(p.method);
      if (p.method === 'cash') cashSales += p.amount;
      else if (p.method === 'card') cardSales += p.amount;
      totalTips += p.tipAmount || 0;
    } else if (p.status === 'refunded' && p.method === 'cash') {
      cashRefunds += p.amount;
    }
  }

  // Split = orders paid with more than one method
  let splitSales = 0;
  for (const order of orders) {
    const methods = orderMethods[order.id];
    if (methods && methods.size > 1) {
      splitSales += order.total;
    }
  }

  // 6. Order items — top products + voids + discounts
  const items =
    orderIds.length > 0
      ? await database
          .get<OrderItem>('order_items')
          .query(Q.where('order_id', Q.oneOf(orderIds)))
          .fetch()
      : [];

  const productAgg: Record<string, { quantity: number; revenue: number }> = {};
  let totalVoids = 0;
  let totalDiscounts = 0;

  for (const item of items) {
    if (item.voidedAt) {
      totalVoids += item.lineTotal;
      continue;
    }
    if (!productAgg[item.productId]) productAgg[item.productId] = { quantity: 0, revenue: 0 };
    productAgg[item.productId].quantity += item.quantity;
    productAgg[item.productId].revenue += item.lineTotal;
    totalDiscounts += item.discountAmount || 0;
  }

  // Order-level discounts
  for (const o of orders) {
    totalDiscounts += o.discountAmount || 0;
  }

  // Fetch product names
  const productIds = Object.keys(productAgg);
  const productNames: Record<string, string> = {};
  for (const id of productIds) {
    try {
      const product = await database.get<Product>('products').find(id);
      productNames[id] = product.name;
    } catch {
      productNames[id] = 'Unknown';
    }
  }

  const topProducts = Object.entries(productAgg)
    .map(([id, data]) => ({ name: productNames[id] || 'Unknown', ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // 7. Cash reconciliation
  const { cashIn, cashOut } = await getShiftCashMovementTotals(database, shift.id);
  const expectedCash = shift.openingFloat + cashSales - cashRefunds + cashIn - cashOut;

  const cashReconciliation: CashReconciliation = {
    openingFloat: shift.openingFloat,
    cashSales,
    cashRefunds,
    cashIn,
    cashOut,
    expectedCash,
  };

  if (closedAtMs) {
    cashReconciliation.actualCash = shift.actualCash;
    cashReconciliation.variance = shift.variance;
  }

  // 8. Drawer opens
  const auditLogs = await database
    .get<AuditLog>('audit_logs')
    .query(Q.where('action', 'no_sale'))
    .fetch();
  const drawerOpens = auditLogs.filter((l) => {
    const data = JSON.parse(l.changesJson ?? '{}');
    return data.shiftId === shift.id;
  }).length;

  // 9. Refunds
  let totalRefunds = 0;
  for (const o of orders) {
    if (o.status === 'refunded') totalRefunds += o.total;
  }

  // 10. Totals
  const completedOrders = orders.filter((o) => o.status === 'completed');
  const totalSales = completedOrders.reduce((sum, o) => sum + o.total, 0);
  const totalGst = completedOrders.reduce((sum, o) => sum + o.gst, 0);
  const orderCount = completedOrders.length;
  const averageOrderValue = orderCount > 0 ? totalSales / orderCount : 0;

  const endMs = closedAtMs || Date.now();
  const shiftDuration = formatDuration(endMs - openedAtMs);

  return {
    shiftId: shift.id,
    staffName,
    openedAt: openedAtMs,
    closedAt: closedAtMs,
    shiftDuration,
    salesByMethod: { cash: cashSales, card: cardSales, split: splitSales },
    totalSales,
    orderCount,
    averageOrderValue,
    totalDiscounts,
    totalVoids,
    totalRefunds,
    totalTips,
    totalGst,
    cashReconciliation,
    topProducts,
    drawerOpens,
  };
}

// ---------------------------------------------------------------------------
// Build Z Report (daily aggregate)
// ---------------------------------------------------------------------------

export async function buildZReport(database: Database, date: Date): Promise<ZReportData> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const shifts = await database
    .get<Shift>('shifts')
    .query(
      Q.where('opened_at', Q.gte(dayStart.getTime())),
      Q.where('opened_at', Q.lte(dayEnd.getTime())),
    )
    .fetch();

  if (shifts.length === 0) {
    const dateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`;
    return {
      date: dateStr,
      dailyRevenue: 0,
      dailyOrderCount: 0,
      dailyGstCollected: 0,
      dailySalesByMethod: { cash: 0, card: 0, split: 0 },
      dailyTotalDiscounts: 0,
      dailyTotalRefunds: 0,
      dailyTotalTips: 0,
      dailyTopProducts: [],
      shifts: [],
    };
  }

  // Build individual shift reports
  const shiftReports = await Promise.all(shifts.map((s) => buildShiftReport(database, s)));

  // Aggregate
  let dailyRevenue = 0;
  let dailyOrderCount = 0;
  let dailyGstCollected = 0;
  const dailySalesByMethod = { cash: 0, card: 0, split: 0 };
  let dailyTotalDiscounts = 0;
  let dailyTotalRefunds = 0;
  let dailyTotalTips = 0;

  const mergedProducts: Record<string, { quantity: number; revenue: number }> = {};

  for (const report of shiftReports) {
    dailyRevenue += report.totalSales;
    dailyOrderCount += report.orderCount;
    dailyGstCollected += report.totalGst;
    dailySalesByMethod.cash += report.salesByMethod.cash;
    dailySalesByMethod.card += report.salesByMethod.card;
    dailySalesByMethod.split += report.salesByMethod.split;
    dailyTotalDiscounts += report.totalDiscounts;
    dailyTotalRefunds += report.totalRefunds;
    dailyTotalTips += report.totalTips;

    for (const p of report.topProducts) {
      if (!mergedProducts[p.name]) mergedProducts[p.name] = { quantity: 0, revenue: 0 };
      mergedProducts[p.name].quantity += p.quantity;
      mergedProducts[p.name].revenue += p.revenue;
    }
  }

  const dailyTopProducts = Object.entries(mergedProducts)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const dateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`;

  return {
    date: dateStr,
    dailyRevenue,
    dailyOrderCount,
    dailyGstCollected,
    dailySalesByMethod,
    dailyTotalDiscounts,
    dailyTotalRefunds,
    dailyTotalTips,
    dailyTopProducts,
    shifts: shiftReports.map((r) => ({
      shiftId: r.shiftId,
      staffName: r.staffName,
      openedAt: r.openedAt,
      closedAt: r.closedAt ?? r.openedAt,
      totalSales: r.totalSales,
      orderCount: r.orderCount,
      cashReconciliation: r.cashReconciliation,
    })),
  };
}
