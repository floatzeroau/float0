'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Coffee } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useAuth } from '@/lib/auth-context';

interface ProductSnapshot {
  name: string;
  modifiers?: { name: string }[];
}

type PackStatus = 'active' | 'expired' | 'consumed' | 'refunded';

interface PortalPack {
  id: string;
  productId: string;
  productSnapshot: ProductSnapshot;
  totalQuantity: number;
  remainingQuantity: number;
  pricePaid: number;
  unitValue: number;
  status: PackStatus;
  expiryDate?: string | null;
  sourceOrderId?: string | null;
  purchasedAt: string;
}

const GROUPS: { key: PackStatus; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'expired', label: 'Expired' },
  { key: 'consumed', label: 'Consumed' },
];

function productLabel(snapshot: ProductSnapshot): string {
  if (!snapshot?.modifiers || snapshot.modifiers.length === 0) return snapshot?.name ?? 'Pack';
  return `${snapshot.name} · ${snapshot.modifiers.map((m) => m.name).join(', ')}`;
}

function formatExpiry(iso?: string | null): { label: string; tone: 'warn' | 'muted' } | null {
  if (!iso) return null;
  const date = new Date(iso);
  const now = new Date();
  const days = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const dateLabel = date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (days < 0) return { label: `Expired ${dateLabel}`, tone: 'muted' };
  if (days === 0) return { label: 'Expires today', tone: 'warn' };
  if (days <= 14) return { label: `Expires in ${days} day${days === 1 ? '' : 's'}`, tone: 'warn' };
  return { label: `Expires ${dateLabel}`, tone: 'muted' };
}

function statusBadge(status: PackStatus) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>;
    case 'expired':
      return <Badge variant="secondary">Expired</Badge>;
    case 'consumed':
      return <Badge variant="secondary">Used up</Badge>;
    case 'refunded':
      return <Badge variant="secondary">Refunded</Badge>;
  }
}

function PackCard({ pack }: { pack: PortalPack }) {
  const expiry = pack.status === 'active' ? formatExpiry(pack.expiryDate) : null;
  const progressPct =
    pack.totalQuantity > 0 ? (pack.remainingQuantity / pack.totalQuantity) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold leading-tight">{productLabel(pack.productSnapshot)}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pack.remainingQuantity} of {pack.totalQuantity} remaining
            </p>
          </div>
          {statusBadge(pack.status)}
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
            aria-label={`${Math.round(progressPct)}% remaining`}
          />
        </div>

        {expiry && (
          <p
            className={
              expiry.tone === 'warn'
                ? 'text-xs font-medium text-amber-700'
                : 'text-xs text-muted-foreground'
            }
          >
            {expiry.label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyPacksPage() {
  const org = useOrg();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [packs, setPacks] = useState<PortalPack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace(`/${org.slug}/login`);
      return;
    }

    api
      .get<PortalPack[]>(`/portal/${org.slug}/me/packs`)
      .then((data) => setPacks(data))
      .catch(() => toast.error('Failed to load your packs.'))
      .finally(() => setLoading(false));
  }, [org.slug, isAuthenticated, authLoading, router]);

  if (authLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const grouped = GROUPS.map(({ key, label }) => ({
    key,
    label,
    packs: packs.filter((p) => p.status === key),
  }));
  const visibleGroups = grouped.filter((g) => g.packs.length > 0);

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold">My Packs</h1>
      <p className="mt-1 text-sm text-muted-foreground">Track your prepaid packs</p>

      {loading && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {!loading && visibleGroups.length === 0 && (
        <div className="mt-12 flex flex-col items-center text-center">
          <Coffee className="h-12 w-12 text-muted-foreground" />
          <p className="mt-3 font-medium">No packs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Once you buy a Cafe Pack at the till, it&apos;ll show up here.
          </p>
        </div>
      )}

      {!loading && visibleGroups.length > 0 && (
        <div className="mt-4 space-y-6">
          {visibleGroups.map((group) => (
            <section key={group.key} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h2>
              <div className="space-y-3">
                {group.packs.map((pack) => (
                  <PackCard key={pack.id} pack={pack} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
