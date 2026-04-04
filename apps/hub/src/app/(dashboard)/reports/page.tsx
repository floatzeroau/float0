'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { CURRENCY, TIMEZONE } from '@float0/shared';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { api, getAccessToken } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DateRangePicker, type DateRange } from '@/components/date-range-picker';
import { SalesSummaryCards } from '@/components/sales-summary-cards';
import { Download } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────

interface SalesReport {
  summary: {
    totalRevenue: number;
    orderCount: number;
    averageOrderValue: number;
    totalGst: number;
    totalDiscount: number;
    totalTips: number;
  };
  byPaymentMethod: { method: string; amount: number; count: number }[];
  byProduct: { productId: string; productName: string; quantity: number; revenue: number }[];
  byCategory: { categoryId: string; categoryName: string; revenue: number; orderCount: number }[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

const PIE_COLORS = ['#2563eb', '#16a34a', '#eab308', '#dc2626', '#8b5cf6'];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: CURRENCY }).format(value);
}

function methodLabel(method: string) {
  return method.charAt(0).toUpperCase() + method.slice(1);
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// ── Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [range, setRange] = useState<DateRange>({ from: today, to: today });
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<SalesReport>(
        `/reports/sales?from=${range.from}&to=${range.to}&timezone=${encodeURIComponent(TIMEZONE)}`,
      );
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = () => {
    const token = getAccessToken();
    const url = `${BASE_URL}/reports/sales/export?from=${range.from}&to=${range.to}&timezone=${encodeURIComponent(TIMEZONE)}`;
    const a = document.createElement('a');
    // Use fetch to add auth header, then trigger download
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        a.href = URL.createObjectURL(blob);
        a.download = `sales-report-${range.from}-to-${range.to}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sales Report</h1>
          <p className="text-sm text-muted-foreground">
            Analyse sales performance across date ranges
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <Button variant="outline" className="gap-2" onClick={handleExport} disabled={loading}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <SalesSummaryCards summary={report?.summary ?? null} loading={loading} />

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Payment Method Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales by Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[300px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : report && report.byPaymentMethod.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={report.byPaymentMethod.map((pm) => ({
                      name: methodLabel(pm.method),
                      value: pm.amount,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  >
                    {report.byPaymentMethod.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                No payment data for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[300px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : report && report.byCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={report.byCategory.map((c) => ({
                    name: c.categoryName,
                    revenue: c.revenue,
                  }))}
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis type="category" dataKey="name" width={80} />
                  <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                No category data for this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Sales Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Products</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : report && report.byProduct.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty Sold</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.byProduct.map((p, i) => (
                  <TableRow key={p.productId}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{p.productName}</TableCell>
                    <TableCell className="text-right">{p.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-8 text-center text-muted-foreground">
              No product sales for this period
            </p>
          )}
        </CardContent>
      </Card>

      {/* Extra summary: discounts & tips */}
      {report && (report.summary.totalDiscount > 0 || report.summary.totalTips > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Discounts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(report.summary.totalDiscount)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Tips
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(report.summary.totalTips)}</div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
