'use client';

import { useEffect, useState } from 'react';
import { DollarSign, ShoppingCart, TrendingUp, Trophy } from 'lucide-react';
import { CURRENCY, TIMEZONE } from '@float0/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { MetricCard } from '@/components/metric-card';
import { RecentOrdersTable } from '@/components/recent-orders-table';
import { SalesChart } from '@/components/sales-chart';
import { TerminalStatus } from '@/components/terminal-status';
import { ActivityFeed } from '@/components/activity-feed';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DashboardSummary {
  totalSales: number;
  orderCount: number;
  averageOrderValue: number;
  totalSalesYesterday: number;
  orderCountYesterday: number;
  averageOrderValueYesterday: number;
  topProduct: { name: string; quantity: number } | null;
  salesByHour: { hour: number; revenue: number; orders: number }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    orderType: string;
    status: string;
    total: number;
    paymentMethod: string | null;
    createdAt: string;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: CURRENCY }).format(amount);
}

function todayDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? 'pm' : 'am';
  const h = hour % 12 || 12;
  return `${h}${suffix}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const date = todayDateString();
    api
      .get<DashboardSummary>(
        `/dashboard/summary?date=${date}&timezone=${encodeURIComponent(TIMEZONE)}`,
      )
      .then(setData)
      .catch((err) => setError(err.message ?? 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Loading today&apos;s summary&hellip;</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-10">
                <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-destructive">{error ?? 'Failed to load dashboard data'}</p>
        </div>
      </div>
    );
  }

  const salesChange = pctChange(data.totalSales, data.totalSalesYesterday);
  const ordersChange = pctChange(data.orderCount, data.orderCountYesterday);
  const aovChange = pctChange(data.averageOrderValue, data.averageOrderValueYesterday);

  // Build sparkline data from salesByHour
  const sparklineData = data.salesByHour.map((h) => ({ value: h.revenue }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Today&apos;s summary &middot; {CURRENCY} &middot; {TIMEZONE}
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Sales"
          value={formatCurrency(data.totalSales)}
          change={salesChange}
          sparklineData={sparklineData}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <MetricCard
          title="Orders"
          value={data.orderCount.toString()}
          change={ordersChange}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <MetricCard
          title="Avg Order Value"
          value={formatCurrency(data.averageOrderValue)}
          change={aovChange}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <MetricCard
          title="Top Product"
          value={data.topProduct ? data.topProduct.name : '—'}
          change={null}
          icon={<Trophy className="h-4 w-4" />}
        />
      </div>

      {/* Sales Chart with Period Toggle (FLO-86) */}
      <SalesChart />

      {/* Terminal Status (FLO-87) */}
      <TerminalStatus />

      {/* Sales by Hour Chart (FLO-85) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales by Hour</CardTitle>
        </CardHeader>
        <CardContent>
          {data.salesByHour.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No sales data yet today.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.salesByHour}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={formatHour}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrency(Number(value)), 'Revenue']}
                    labelFormatter={(label) => formatHour(Number(label))}
                  />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentOrdersTable orders={data.recentOrders} />
        </CardContent>
      </Card>

      {/* Activity Feed (FLO-88) */}
      <ActivityFeed />
    </div>
  );
}
