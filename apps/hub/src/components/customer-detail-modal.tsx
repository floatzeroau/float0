'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  DollarSign,
  Calendar,
  Hash,
  Mail,
  Phone,
  Pencil,
  UserX,
  KeyRound,
  Package,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { PackAdjustModal } from './pack-adjust-modal';
import { PackRefundModal } from './pack-refund-modal';
import { EnablePortalDialog } from './enable-portal-dialog';

interface ProductSnapshot {
  name: string;
  modifiers?: { name: string }[];
}

interface Pack {
  id: string;
  productId: string;
  productSnapshot: ProductSnapshot;
  totalQuantity: number;
  remainingQuantity: number;
  pricePaid: number;
  unitValue: number;
  expiryDate?: string | null;
  status: 'active' | 'expired' | 'consumed' | 'refunded';
  sourceOrderId?: string | null;
  purchasedAt: string;
}

interface PackHistoryEntry {
  id: string;
  packId: string;
  type: 'purchase' | 'serve' | 'refund' | 'admin_adjust';
  quantity: number;
  amount: number;
  referenceId?: string | null;
  staffId?: string | null;
  notes?: string | null;
  createdAt: string;
  productSnapshot: ProductSnapshot;
}

interface CustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  totalSpent: number;
  visitCount: number;
  lastVisit?: string | null;
  activePackCount?: number;
  hasPortalAccess?: boolean;
  status: string;
  createdAt: string;
}

interface CustomerDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  onEdit: () => void;
  onDeactivate: () => void;
  onRefresh?: () => void;
}

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function packStatusColor(status: Pack['status']): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'expired':
      return 'bg-yellow-100 text-yellow-800';
    case 'consumed':
      return 'bg-muted text-muted-foreground';
    case 'refunded':
      return 'bg-red-100 text-red-800';
  }
}

function historyTypeLabel(type: PackHistoryEntry['type']): string {
  switch (type) {
    case 'purchase':
      return 'Purchased';
    case 'serve':
      return 'Served';
    case 'refund':
      return 'Refunded';
    case 'admin_adjust':
      return 'Adjusted';
  }
}

function historyTypeColor(type: PackHistoryEntry['type']): string {
  switch (type) {
    case 'purchase':
      return 'bg-green-100 text-green-800';
    case 'serve':
      return 'bg-blue-100 text-blue-800';
    case 'refund':
      return 'bg-red-100 text-red-800';
    case 'admin_adjust':
      return 'bg-yellow-100 text-yellow-800';
  }
}

function productLabel(snapshot: ProductSnapshot): string {
  if (!snapshot?.modifiers || snapshot.modifiers.length === 0) return snapshot?.name ?? '—';
  return `${snapshot.name} · ${snapshot.modifiers.map((m) => m.name).join(', ')}`;
}

const PACK_GROUPS: { key: Pack['status']; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'expired', label: 'Expired' },
  { key: 'consumed', label: 'Consumed' },
  { key: 'refunded', label: 'Refunded' },
];

export function CustomerDetailModal({
  open,
  onOpenChange,
  customerId,
  onEdit,
  onDeactivate,
  onRefresh,
}: CustomerDetailModalProps) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [history, setHistory] = useState<PackHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [packsLoading, setPacksLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [adjustPack, setAdjustPack] = useState<Pack | null>(null);
  const [refundPack, setRefundPack] = useState<Pack | null>(null);
  const [enablePortalOpen, setEnablePortalOpen] = useState(false);

  const fetchCustomer = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const data = await api.get<CustomerDetail>(`/customers/${customerId}`);
      setCustomer(data);
    } catch {
      toast.error('Failed to load customer details.');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  const fetchPacks = useCallback(async () => {
    if (!customerId) return;
    setPacksLoading(true);
    try {
      const data = await api.get<Pack[]>(`/customers/${customerId}/packs`);
      setPacks(data);
    } catch {
      toast.error('Failed to load packs.');
    } finally {
      setPacksLoading(false);
    }
  }, [customerId]);

  const fetchHistory = useCallback(async () => {
    if (!customerId) return;
    setHistoryLoading(true);
    try {
      const res = await api.get<{ data: PackHistoryEntry[] }>(
        `/customers/${customerId}/packs/history?limit=50`,
      );
      setHistory(res.data);
    } catch {
      toast.error('Failed to load pack history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (open && customerId) {
      fetchCustomer();
      fetchPacks();
      fetchHistory();
    }
    if (!open) {
      setCustomer(null);
      setPacks([]);
      setHistory([]);
    }
  }, [open, customerId, fetchCustomer, fetchPacks, fetchHistory]);

  function handleAfterPackChange() {
    fetchPacks();
    fetchHistory();
    onRefresh?.();
  }

  function handlePortalEnabled() {
    fetchCustomer();
    onRefresh?.();
  }

  const initials = customer ? `${customer.firstName[0]}${customer.lastName[0]}`.toUpperCase() : '';
  const groupedPacks = PACK_GROUPS.map((g) => ({
    ...g,
    items: packs.filter((p) => p.status === g.key),
  }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {loading ? (
                <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              ) : customer ? (
                <>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {initials}
                  </span>
                  <span>
                    {customer.firstName} {customer.lastName}
                  </span>
                  <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>
                    {customer.status}
                  </Badge>
                  {customer.hasPortalAccess && (
                    <Badge variant="outline" className="gap-1">
                      <KeyRound className="h-3 w-3" />
                      Portal
                    </Badge>
                  )}
                </>
              ) : (
                'Customer'
              )}
            </DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="space-y-4 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          )}

          {!loading && customer && (
            <>
              <div className="flex flex-wrap gap-2 pb-2">
                <Button size="sm" variant="outline" onClick={onEdit}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
                {!customer.hasPortalAccess && (
                  <Button size="sm" variant="outline" onClick={() => setEnablePortalOpen(true)}>
                    <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                    Enable Portal Access
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={onDeactivate}
                >
                  <UserX className="mr-1.5 h-3.5 w-3.5" />
                  Deactivate
                </Button>
              </div>

              <Tabs defaultValue="overview">
                <TabsList className="w-full">
                  <TabsTrigger value="overview" className="flex-1">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="packs" className="flex-1">
                    Packs
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex-1">
                    History
                  </TabsTrigger>
                </TabsList>

                {/* Overview tab */}
                <TabsContent value="overview" className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    {customer.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{customer.email}</span>
                      </div>
                    )}
                    {customer.phone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <StatCard
                      icon={<DollarSign className="h-4 w-4" />}
                      label="Total Spent"
                      value={`$${Number(customer.totalSpent).toFixed(2)}`}
                    />
                    <StatCard
                      icon={<Hash className="h-4 w-4" />}
                      label="Visits"
                      value={String(customer.visitCount)}
                    />
                    <StatCard
                      icon={<Calendar className="h-4 w-4" />}
                      label="Last Visit"
                      value={customer.lastVisit ? relativeTime(customer.lastVisit) : 'Never'}
                    />
                    <StatCard
                      icon={<Package className="h-4 w-4" />}
                      label="Active Packs"
                      value={String(customer.activePackCount ?? 0)}
                    />
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Customer since {new Date(customer.createdAt).toLocaleDateString()}
                  </div>
                </TabsContent>

                {/* Packs tab */}
                <TabsContent value="packs" className="space-y-4 pt-2">
                  {packsLoading && (
                    <div className="space-y-2">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="h-20 animate-pulse rounded-md bg-muted" />
                      ))}
                    </div>
                  )}

                  {!packsLoading && packs.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">No packs yet.</p>
                  )}

                  {!packsLoading &&
                    groupedPacks
                      .filter((g) => g.items.length > 0)
                      .map((g) => (
                        <div key={g.key} className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                            {g.label} ({g.items.length})
                          </h3>
                          <div className="space-y-2">
                            {g.items.map((pack) => (
                              <PackRow
                                key={pack.id}
                                pack={pack}
                                onAdjust={() => setAdjustPack(pack)}
                                onRefund={() => setRefundPack(pack)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                </TabsContent>

                {/* History tab */}
                <TabsContent value="history" className="space-y-2 pt-2">
                  {historyLoading && (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
                      ))}
                    </div>
                  )}

                  {!historyLoading && history.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No pack activity yet.
                    </p>
                  )}

                  {!historyLoading &&
                    history.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className={historyTypeColor(entry.type)}>
                              {historyTypeLabel(entry.type)}
                            </Badge>
                            <span className="text-sm font-medium">
                              {entry.quantity > 0 ? '+' : ''}
                              {entry.quantity}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {productLabel(entry.productSnapshot)}
                          </p>
                          {entry.notes && (
                            <p className="mt-0.5 truncate text-xs italic text-muted-foreground">
                              {entry.notes}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          {entry.amount !== 0 && (
                            <p className="font-mono text-sm font-medium text-foreground">
                              ${Number(entry.amount).toFixed(2)}
                            </p>
                          )}
                          <p>{relativeTime(entry.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      <PackAdjustModal
        open={!!adjustPack}
        onOpenChange={(open) => !open && setAdjustPack(null)}
        customerId={customerId ?? ''}
        pack={
          adjustPack
            ? {
                id: adjustPack.id,
                productName: productLabel(adjustPack.productSnapshot),
                remainingQuantity: adjustPack.remainingQuantity,
              }
            : null
        }
        onAdjusted={() => {
          setAdjustPack(null);
          handleAfterPackChange();
        }}
      />

      <PackRefundModal
        open={!!refundPack}
        onOpenChange={(open) => !open && setRefundPack(null)}
        customerId={customerId ?? ''}
        pack={
          refundPack
            ? {
                id: refundPack.id,
                productName: productLabel(refundPack.productSnapshot),
                remainingQuantity: refundPack.remainingQuantity,
                unitValue: refundPack.unitValue,
              }
            : null
        }
        onRefunded={() => {
          setRefundPack(null);
          handleAfterPackChange();
        }}
      />

      <EnablePortalDialog
        open={enablePortalOpen}
        onOpenChange={setEnablePortalOpen}
        customerId={customerId ?? ''}
        customer={customer}
        onEnabled={handlePortalEnabled}
      />
    </>
  );
}

function PackRow({
  pack,
  onAdjust,
  onRefund,
}: {
  pack: Pack;
  onAdjust: () => void;
  onRefund: () => void;
}) {
  const expired = pack.status === 'expired';
  const expiresSoon =
    pack.status === 'active' &&
    pack.expiryDate &&
    new Date(pack.expiryDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
  const remainingValue = pack.remainingQuantity * pack.unitValue;
  const canRefund = pack.status === 'active' && pack.remainingQuantity > 0;

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{productLabel(pack.productSnapshot)}</p>
            <Badge variant="secondary" className={packStatusColor(pack.status)}>
              {pack.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pack.remainingQuantity}/{pack.totalQuantity} remaining · ${remainingValue.toFixed(2)}{' '}
            value
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>Bought {relativeTime(pack.purchasedAt)}</span>
            {pack.expiryDate && (
              <span
                className={
                  expired
                    ? 'text-yellow-700'
                    : expiresSoon
                      ? 'flex items-center gap-1 text-amber-700'
                      : ''
                }
              >
                {expiresSoon && <AlertCircle className="h-3 w-3" />}
                {expired ? 'Expired' : 'Expires'} {new Date(pack.expiryDate).toLocaleDateString()}
              </span>
            )}
            <span>Paid ${Number(pack.pricePaid).toFixed(2)}</span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onAdjust}>
              <Pencil className="mr-2 h-4 w-4" />
              Adjust
            </DropdownMenuItem>
            {canRefund && (
              <DropdownMenuItem onClick={onRefund} className="text-destructive">
                <RefreshCw className="mr-2 h-4 w-4" />
                Refund
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
