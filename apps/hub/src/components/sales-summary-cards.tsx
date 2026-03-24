'use client';

import { CURRENCY } from '@float0/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShoppingCart, TrendingUp, Receipt } from 'lucide-react';

interface SalesSummary {
  totalRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  totalGst: number;
  totalDiscount: number;
  totalTips: number;
}

interface SalesSummaryCardsProps {
  summary: SalesSummary | null;
  loading: boolean;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: CURRENCY }).format(value);
}

const cards = [
  { key: 'totalRevenue', label: 'Total Revenue', icon: DollarSign, format: true },
  { key: 'orderCount', label: 'Orders', icon: ShoppingCart, format: false },
  { key: 'averageOrderValue', label: 'Avg Order Value', icon: TrendingUp, format: true },
  { key: 'totalGst', label: 'Total GST', icon: Receipt, format: true },
] as const;

export function SalesSummaryCards({ summary, loading }: SalesSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.key}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            <c.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading || !summary ? (
              <div className="h-8 w-24 animate-pulse rounded bg-muted" />
            ) : (
              <div className="text-2xl font-bold">
                {c.format ? formatCurrency(summary[c.key]) : summary[c.key].toLocaleString()}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
