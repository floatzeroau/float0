'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface PackCardProps {
  name: string;
  description?: string | null;
  packSize: number;
  price: number;
  perItemValue: number;
  savings: number;
  onBuy: () => void;
}

export function PackCard({
  name,
  description,
  packSize,
  price,
  perItemValue,
  savings,
  onBuy,
}: PackCardProps) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold">{name}</h3>
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{description}</p>
            )}
          </div>
          {savings > 0 && (
            <Badge className="ml-2 shrink-0 bg-green-100 text-green-800 hover:bg-green-100">
              Save ${savings.toFixed(2)}
            </Badge>
          )}
        </div>

        <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{packSize} items</span>
          <span>${perItemValue.toFixed(2)} each</span>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-lg font-bold">${price.toFixed(2)}</span>
          <Button size="sm" onClick={onBuy}>
            Buy Pack
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
