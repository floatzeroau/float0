'use client';

import { useEffect, useState } from 'react';
import { CURRENCY, TIMEZONE } from '@float0/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = 'hourly' | 'daily' | 'weekly';

interface SalesPeriodEntry {
  label: string;
  revenue: number;
  orderCount: number;
}

interface SalesChartResponse {
  period: Period;
  data: SalesPeriodEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: CURRENCY }).format(amount);
}

function todayDateString() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

function getCurrentHourLabel() {
  const now = new Date();
  const hour = Number(
    now.toLocaleString('en-AU', { hour: 'numeric', hour12: false, timeZone: TIMEZONE }),
  );
  const suffix = hour >= 12 ? 'pm' : 'am';
  const display = hour % 12 || 12;
  return `${display}${suffix}`;
}

function getCurrentDayLabel() {
  return new Date().toLocaleDateString('en-AU', { weekday: 'short', timeZone: TIMEZONE });
}

function getCurrentWeekLabel() {
  const now = new Date();
  const day = Number(now.toLocaleDateString('en-AU', { day: 'numeric', timeZone: TIMEZONE }));
  const week = Math.ceil(day / 7);
  return `Week ${week}`;
}

const periodLabels: Record<Period, string> = {
  hourly: 'Today (Hourly)',
  daily: 'This Week (Daily)',
  weekly: 'This Month (Weekly)',
};

// ---------------------------------------------------------------------------
// Custom Tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: SalesPeriodEntry }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{label}</p>
      <p className="text-muted-foreground">
        Revenue:{' '}
        <span className="font-medium text-foreground">{formatCurrency(entry.revenue)}</span>
      </p>
      <p className="text-muted-foreground">
        Orders: <span className="font-medium text-foreground">{entry.orderCount}</span>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SalesChart() {
  const [period, setPeriod] = useState<Period>('hourly');
  const [data, setData] = useState<SalesPeriodEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const date = todayDateString();
    api
      .get<SalesChartResponse>(
        `/dashboard/sales-chart?period=${period}&date=${date}&timezone=${encodeURIComponent(TIMEZONE)}`,
      )
      .then((res) => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [period]);

  // Determine which bar to highlight
  const highlightLabel =
    period === 'hourly'
      ? getCurrentHourLabel()
      : period === 'daily'
        ? getCurrentDayLabel()
        : getCurrentWeekLabel();

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Sales Overview</CardTitle>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="hourly">Hourly</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs text-muted-foreground">{periodLabels[period]}</p>
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : data.length === 0 ? (
          <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No sales data available.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="label"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  interval={period === 'hourly' ? 2 : 0}
                />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${v}`}
                  width={50}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                  {data.map((entry) => (
                    <Cell
                      key={entry.label}
                      fill={
                        entry.label === highlightLabel
                          ? 'hsl(var(--primary))'
                          : 'hsl(var(--primary) / 0.4)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
