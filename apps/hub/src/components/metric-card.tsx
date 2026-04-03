'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

interface MetricCardProps {
  title: string;
  value: string;
  change: number | null;
  sparklineData?: { value: number }[];
  icon: React.ReactNode;
}

export function MetricCard({ title, value, change, sparklineData, icon }: MetricCardProps) {
  const isPositive = change !== null && change >= 0;
  const changeText = change !== null ? `${isPositive ? '+' : ''}${change.toFixed(1)}%` : '—';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <Badge
              variant={isPositive ? 'default' : 'secondary'}
              className={cn('mt-1 text-xs', change === null && 'opacity-50')}
            >
              {changeText} vs yesterday
            </Badge>
          </div>
          {sparklineData && sparklineData.length > 1 && (
            <div className="h-12 w-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparklineData}>
                  <defs>
                    <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={1.5}
                    fill="url(#sparkGradient)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
