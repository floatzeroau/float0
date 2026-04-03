'use client';

import { useEffect, useState } from 'react';
import { Monitor, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Terminal {
  terminalId: string;
  status: 'online' | 'offline';
  lastActivityAt: string | null;
  shiftStatus: 'open' | 'closed' | null;
  shiftOpenedAt: string | null;
  staffName: string | null;
  orderCount: number;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TerminalStatus() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    function fetchTerminals() {
      api
        .get<Terminal[]>('/terminals')
        .then((data) => {
          if (mounted) setTerminals(data);
        })
        .catch(() => {
          if (mounted) setTerminals([]);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }

    fetchTerminals();
    // Poll every 30s to keep status fresh
    const interval = setInterval(fetchTerminals, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const onlineCount = terminals.filter((t) => t.status === 'online').length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Terminal Status</CardTitle>
        {!loading && terminals.length > 0 && (
          <Badge variant={onlineCount > 0 ? 'default' : 'secondary'}>
            {onlineCount}/{terminals.length} online
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : terminals.length === 0 ? (
          <div className="py-6 text-center">
            <Monitor className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm font-medium text-muted-foreground">No terminals connected</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Open a shift on a POS terminal to see it here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {terminals.map((terminal) => (
              <div
                key={terminal.terminalId}
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md',
                    terminal.status === 'online'
                      ? 'bg-emerald-500/10 text-emerald-600'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {terminal.status === 'online' ? (
                    <Wifi className="h-4 w-4" />
                  ) : (
                    <WifiOff className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{terminal.terminalId}</span>
                    <span
                      className={cn(
                        'inline-block h-2 w-2 rounded-full',
                        terminal.status === 'online' ? 'bg-emerald-500' : 'bg-red-500',
                      )}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {terminal.staffName && <span>{terminal.staffName}</span>}
                    {terminal.staffName && terminal.lastActivityAt && <span>&middot;</span>}
                    {terminal.lastActivityAt && (
                      <span>Last sync: {relativeTime(terminal.lastActivityAt)}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge
                    variant={terminal.shiftStatus === 'open' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {terminal.shiftStatus === 'open' ? 'Shift open' : 'Shift closed'}
                  </Badge>
                  {terminal.orderCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {terminal.orderCount} order{terminal.orderCount !== 1 ? 's' : ''} today
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
