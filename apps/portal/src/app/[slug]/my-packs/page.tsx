'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useAuth } from '@/lib/auth-context';
import { BalanceCard } from '@/components/balance-card';

interface Balance {
  id: string;
  packName: string;
  packId: string;
  remainingCount: number;
  originalCount: number;
  pricePaid: number;
  purchasedAt: string;
}

interface Transaction {
  id: string;
  type: string;
  quantity: number;
  orderId?: string | null;
  notes?: string | null;
  createdAt: string;
  packName: string;
}

function txDescription(tx: Transaction): string {
  switch (tx.type) {
    case 'purchase':
      return `+${tx.quantity} ${tx.packName} purchased`;
    case 'redeem':
      return `Redeemed ${tx.quantity} item${tx.quantity !== 1 ? 's' : ''}`;
    case 'admin_adjust':
      return `${tx.quantity > 0 ? '+' : ''}${tx.quantity} adjusted${tx.notes ? ` — ${tx.notes}` : ''}`;
    case 'refund':
      return `+${tx.quantity} refunded`;
    default:
      return `${tx.quantity > 0 ? '+' : ''}${tx.quantity} ${tx.type}`;
  }
}

function txBadgeColor(type: string): string {
  switch (type) {
    case 'purchase':
      return 'bg-green-100 text-green-800';
    case 'redeem':
      return 'bg-blue-100 text-blue-800';
    case 'admin_adjust':
      return 'bg-yellow-100 text-yellow-800';
    case 'refund':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export default function MyPacksPage() {
  const org = useOrg();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [balances, setBalances] = useState<Balance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace(`/${org.slug}/login`);
      return;
    }

    Promise.all([
      api.get<Balance[]>(`/portal/${org.slug}/me/balances`),
      api.get<Transaction[]>(`/portal/${org.slug}/me/balances/history`),
    ])
      .then(([b, t]) => {
        setBalances(b);
        setTransactions(t);
      })
      .catch(() => toast.error('Failed to load pack data.'))
      .finally(() => setLoading(false));
  }, [org.slug, isAuthenticated, authLoading, router]);

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold">My Packs</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your prepaid pack balances</p>

      {loading && (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* Active balances */}
          {balances.length === 0 ? (
            <div className="mt-8 text-center">
              <p className="text-4xl">☕</p>
              <p className="mt-2 text-muted-foreground">
                No active packs. Visit the packs page to see what&apos;s available.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {balances.map((b) => (
                <BalanceCard
                  key={b.id}
                  packName={b.packName}
                  remainingCount={b.remainingCount}
                  originalCount={b.originalCount}
                  purchasedAt={b.purchasedAt}
                />
              ))}
            </div>
          )}

          {/* Transaction history */}
          {transactions.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold">History</h2>
              <div className="mt-3 space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{txDescription(tx)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className={txBadgeColor(tx.type)}>
                      {tx.type.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
