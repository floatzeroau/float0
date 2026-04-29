'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useAuth } from '@/lib/auth-context';

type EntryType = 'order' | 'pack_purchase' | 'pack_serve' | 'pack_refund' | 'pack_adjust';

interface HistoryEntry {
  id: string;
  type: EntryType;
  description: string;
  amount: number | null;
  quantity: number | null;
  timestamp: string;
  referenceId: string | null;
}

interface HistoryResponse {
  data: HistoryEntry[];
  nextCursor: string | null;
  limit: number;
}

function typeBadge(type: EntryType) {
  switch (type) {
    case 'order':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Order</Badge>;
    case 'pack_purchase':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Pack purchase</Badge>
      );
    case 'pack_serve':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Redeemed</Badge>;
    case 'pack_refund':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Refund</Badge>;
    case 'pack_adjust':
      return (
        <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Adjustment</Badge>
      );
  }
}

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function dateHeader(iso: string): string {
  const date = new Date(iso);
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  const diffDays = Math.round((today - day) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-AU', { weekday: 'long' });
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAmount(entry: HistoryEntry): string | null {
  if (entry.amount != null) return `$${entry.amount.toFixed(2)}`;
  return null;
}

export default function HistoryPage() {
  const org = useOrg();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(
    async (nextCursor: string | null) => {
      const qs = nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : '';
      return api.get<HistoryResponse>(`/portal/${org.slug}/me/history${qs}`);
    },
    [org.slug],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace(`/${org.slug}/login`);
      return;
    }

    fetchPage(null)
      .then((res) => {
        setEntries(res.data);
        setCursor(res.nextCursor);
        setHasMore(!!res.nextCursor);
      })
      .catch(() => toast.error('Failed to load history.'))
      .finally(() => setLoading(false));
  }, [org.slug, isAuthenticated, authLoading, router, fetchPage]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetchPage(cursor);
      setEntries((prev) => [...prev, ...res.data]);
      setCursor(res.nextCursor);
      setHasMore(!!res.nextCursor);
    } catch {
      toast.error('Failed to load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Group entries by day header
  const groups: { key: string; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const key = dateHeader(entry.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      groups.push({ key, entries: [entry] });
    }
  }

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold">History</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your orders and pack activity</p>

      {loading && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="mt-12 flex flex-col items-center text-center">
          <Clock className="h-12 w-12 text-muted-foreground" />
          <p className="mt-3 font-medium">No activity yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your orders and pack history will appear here.
          </p>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="mt-4 space-y-6">
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.key}
              </h2>
              <div className="space-y-2">
                {group.entries.map((entry) => {
                  const amount = formatAmount(entry);
                  return (
                    <div
                      key={entry.id}
                      className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {typeBadge(entry.type)}
                          <p className="text-sm font-medium">{entry.description}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatTime(entry.timestamp)}
                        </p>
                      </div>
                      {amount && (
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {amount}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
