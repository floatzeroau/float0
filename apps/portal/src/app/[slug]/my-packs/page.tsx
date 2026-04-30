'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, Coffee } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/progress-bar';
import { api } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

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

interface Group {
  key: PackStatus;
  label: string;
  defaultOpen: boolean;
}

const GROUPS: Group[] = [
  { key: 'active', label: 'Active', defaultOpen: true },
  { key: 'expired', label: 'Expired', defaultOpen: false },
  { key: 'consumed', label: 'Used up', defaultOpen: false },
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
      return (
        <Badge className="border-transparent bg-success/15 text-[hsl(var(--success))] hover:bg-success/15">
          Active
        </Badge>
      );
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
  const isInactive = pack.status !== 'active';

  return (
    <Card className={cn('overflow-hidden', isInactive && 'opacity-75')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-body font-semibold leading-tight">
              {productLabel(pack.productSnapshot)}
            </h3>
            <p className="mt-0.5 text-small text-muted-foreground">
              {pack.remainingQuantity} of {pack.totalQuantity} remaining
            </p>
          </div>
          {statusBadge(pack.status)}
        </div>

        <ProgressBar
          value={pack.remainingQuantity}
          max={pack.totalQuantity}
          ariaLabel={`${pack.remainingQuantity} of ${pack.totalQuantity} remaining`}
        />

        {expiry && (
          <p
            className={
              expiry.tone === 'warn'
                ? 'text-small font-medium text-[hsl(var(--warning))]'
                : 'text-small text-muted-foreground'
            }
          >
            {expiry.label}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface CollapsibleSectionProps {
  label: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ label, count, defaultOpen, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-left transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        <span className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
          {label} <span className="ml-1 normal-case tracking-normal">({count})</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </section>
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

  const grouped = GROUPS.map((g) => ({
    ...g,
    packs: packs.filter((p) => p.status === g.key),
  }));
  const visibleGroups = grouped.filter((g) => g.packs.length > 0);

  return (
    <div className="fade-in px-4 pb-8 pt-6">
      <h1 className="text-display font-bold">My Packs</h1>
      <p className="mt-1 text-body text-muted-foreground">Your prepaid coffee packs.</p>

      {loading && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {!loading && visibleGroups.length === 0 && (
        <EmptyState
          className="mt-10"
          icon={Coffee}
          title="No packs yet"
          description="Buy a Cafe Pack at the till and it’ll show up here. You'll save with every cup."
        />
      )}

      {!loading && visibleGroups.length > 0 && (
        <div className="mt-5 space-y-5">
          {visibleGroups.map((group) => (
            <CollapsibleSection
              key={group.key}
              label={group.label}
              count={group.packs.length}
              defaultOpen={group.defaultOpen}
            >
              {group.packs.map((pack) => (
                <PackCard key={pack.id} pack={pack} />
              ))}
            </CollapsibleSection>
          ))}
        </div>
      )}
    </div>
  );
}
