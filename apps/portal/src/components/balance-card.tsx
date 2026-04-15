'use client';

import { Card, CardContent } from '@/components/ui/card';

interface BalanceCardProps {
  packName: string;
  remainingCount: number;
  originalCount: number;
  purchasedAt: string;
}

export function BalanceCard({
  packName,
  remainingCount,
  originalCount,
  purchasedAt,
}: BalanceCardProps) {
  const pct = originalCount > 0 ? (remainingCount / originalCount) * 100 : 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{packName}</h3>
          <span className="text-sm font-medium text-primary">
            {remainingCount}/{originalCount}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{remainingCount} remaining</span>
          <span>Purchased {new Date(purchasedAt).toLocaleDateString()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
