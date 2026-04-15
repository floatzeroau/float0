'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Coffee, DollarSign, Calendar, Hash, Mail, Phone, Pencil, UserX } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';
import { BalanceAdjustModal } from './balance-adjust-modal';

interface Balance {
  id: string;
  packId: string;
  packName: string;
  remainingCount: number;
  originalCount: number;
  pricePaid: number;
  purchasedAt: string;
}

interface Order {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  total: number;
  createdAt: string;
  itemCount: number;
}

interface CustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  coffeeBalance: number;
  totalSpent: number;
  visitCount: number;
  lastVisit?: string | null;
  status: string;
  createdAt: string;
  balances: Balance[];
  recentOrders: Order[];
}

interface CustomerDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  onEdit: () => void;
  onDeactivate: () => void;
  onRefresh: () => void;
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

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'refunded':
    case 'cancelled':
    case 'voided':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
}

export function CustomerDetailModal({
  open,
  onOpenChange,
  customerId,
  onEdit,
  onDeactivate,
  onRefresh,
}: CustomerDetailModalProps) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [adjustBalance, setAdjustBalance] = useState<Balance | null>(null);

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

  useEffect(() => {
    if (open && customerId) {
      fetchCustomer();
    }
    if (!open) {
      setCustomer(null);
    }
  }, [open, customerId, fetchCustomer]);

  const initials = customer ? `${customer.firstName[0]}${customer.lastName[0]}`.toUpperCase() : '';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
              <div className="flex gap-2 pb-2">
                <Button size="sm" variant="outline" onClick={onEdit}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
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
                  <TabsTrigger value="orders" className="flex-1">
                    Orders
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
                      icon={<Coffee className="h-4 w-4" />}
                      label="Pack Balance"
                      value={String(customer.coffeeBalance)}
                    />
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
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Customer since {new Date(customer.createdAt).toLocaleDateString()}
                  </div>
                </TabsContent>

                {/* Packs tab */}
                <TabsContent value="packs" className="space-y-3 pt-2">
                  {customer.balances.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No active packs.
                    </p>
                  ) : (
                    customer.balances.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{b.packName}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.remainingCount} / {b.originalCount} remaining
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Purchased {relativeTime(b.purchasedAt)} &middot; $
                            {Number(b.pricePaid).toFixed(2)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{b.remainingCount} left</Badge>
                          <Button size="sm" variant="outline" onClick={() => setAdjustBalance(b)}>
                            Adjust
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>

                {/* Orders tab */}
                <TabsContent value="orders" className="space-y-2 pt-2">
                  {customer.recentOrders.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">No orders yet.</p>
                  ) : (
                    customer.recentOrders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">#{order.orderNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {order.itemCount} item{order.itemCount !== 1 ? 's' : ''} &middot;{' '}
                            {order.orderType.replace('_', ' ')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">${Number(order.total).toFixed(2)}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className={statusColor(order.status)}>
                              {order.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {relativeTime(order.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {adjustBalance && customer && (
        <BalanceAdjustModal
          open={!!adjustBalance}
          onOpenChange={(v) => !v && setAdjustBalance(null)}
          customerId={customer.id}
          balance={adjustBalance}
          onAdjusted={() => {
            fetchCustomer();
            onRefresh();
          }}
        />
      )}
    </>
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
