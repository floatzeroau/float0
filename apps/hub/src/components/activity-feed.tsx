'use client';

import { useEffect, useState } from 'react';
import {
  ShoppingCart,
  CreditCard,
  Package,
  UserCheck,
  Banknote,
  Receipt,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActivityEntry {
  id: string;
  type: string;
  description: string;
  staffName: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const typeConfig: Record<string, { icon: typeof Activity; color: string }> = {
  order: { icon: ShoppingCart, color: 'text-blue-600 bg-blue-500/10' },
  payment: { icon: CreditCard, color: 'text-emerald-600 bg-emerald-500/10' },
  product: { icon: Package, color: 'text-violet-600 bg-violet-500/10' },
  shift: { icon: UserCheck, color: 'text-amber-600 bg-amber-500/10' },
  cash: { icon: Banknote, color: 'text-green-600 bg-green-500/10' },
  receipt: { icon: Receipt, color: 'text-sky-600 bg-sky-500/10' },
  other: { icon: Activity, color: 'text-muted-foreground bg-muted' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    function fetchActivity() {
      api
        .get<ActivityEntry[]>('/activity?limit=20')
        .then((data) => {
          if (mounted) setEntries(data);
        })
        .catch(() => {
          if (mounted) setEntries([]);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }

    fetchActivity();
    const interval = setInterval(fetchActivity, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-8 w-8 animate-pulse rounded-md bg-muted" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-8 text-center">
            <Activity className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-1 pr-4">
              {entries.map((entry) => {
                const config = typeConfig[entry.type] ?? typeConfig.other;
                const Icon = config.icon;
                const [iconColor, iconBg] = config.color.split(' ');

                return (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                        iconBg,
                      )}
                    >
                      <Icon className={cn('h-4 w-4', iconColor)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-tight">{entry.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {entry.staffName} &middot; {relativeTime(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
