'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Order {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  tableNumber: string | null;
  subtotal: number;
  gst: number;
  total: number;
  discountAmount: number;
  notes: string | null;
  createdAt: string;
  customerName: string | null;
  staffName: string | null;
  paymentMethod: string | null;
  itemCount: number;
}

interface OrderDetail extends Order {
  items: {
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    modifiersJson: unknown;
    notes: string | null;
  }[];
  payments: {
    method: string;
    amount: number;
    status: string;
  }[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLOURS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  open: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  voided: 'bg-red-100 text-red-700',
  refunded: 'bg-amber-100 text-amber-700',
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: 'Dine In',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
};

function formatCurrency(dollars: number) {
  return `$${dollars.toFixed(2)}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Detail modal
  const [detailOrder, setDetailOrder] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [voidConfirm, setVoidConfirm] = useState(false);
  const [voiding, setVoiding] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  const fetchOrders = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('limit', '25');
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (typeFilter !== 'all') params.set('orderType', typeFilter);
        if (search) params.set('search', search);
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);

        const res = await api.get<{ data: Order[]; pagination: Pagination }>(
          `/orders?${params.toString()}`,
        );
        setOrders(res.data);
        setPagination(res.pagination);
      } catch {
        toast.error('Failed to load orders.');
      } finally {
        setLoading(false);
      }
    },
    [search, statusFilter, typeFilter, fromDate, toDate],
  );

  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  async function openDetail(orderId: string) {
    setDetailLoading(true);
    setDetailOrder(null);
    try {
      const res = await api.get<OrderDetail>(`/orders/${orderId}`);
      setDetailOrder(res);
    } catch {
      toast.error('Failed to load order details.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleVoidOrder() {
    if (!detailOrder) return;
    setVoiding(true);
    try {
      await api.post(`/orders/${detailOrder.id}/void`, {});
      toast.success(`Order ${detailOrder.orderNumber} voided.`);
      setDetailOrder(null);
      setVoidConfirm(false);
      fetchOrders(pagination.page);
    } catch {
      toast.error('Failed to void order.');
    } finally {
      setVoiding(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">View and search your order history.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by order # or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="dine_in">Dine In</SelectItem>
            <SelectItem value="takeaway">Takeaway</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="w-[150px]"
          placeholder="From"
        />
        <Input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="w-[150px]"
          placeholder="To"
        />

        {(search || statusFilter !== 'all' || typeFilter !== 'all' || fromDate || toDate) && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setSearch('');
              setStatusFilter('all');
              setTypeFilter('all');
              setFromDate('');
              setToDate('');
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order #</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Staff</TableHead>
              <TableHead>Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading && orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-40 text-center">
                  <p className="text-sm text-muted-foreground">No orders found.</p>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              orders.map((order) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openDetail(order.id)}
                >
                  <TableCell className="font-medium">{order.orderNumber}</TableCell>
                  <TableCell>{ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={STATUS_COLOURS[order.status] ?? ''}>
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.customerName ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{order.staffName ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">{order.itemCount}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(order.total)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.paymentMethod ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(order.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1}–
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              disabled={pagination.page <= 1}
              onClick={() => fetchOrders(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchOrders(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Dialog
        open={!!detailOrder || detailLoading}
        onOpenChange={(open) => {
          if (!open) {
            setDetailOrder(null);
            setVoidConfirm(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {detailOrder ? `Order ${detailOrder.orderNumber}` : 'Loading...'}
            </DialogTitle>
          </DialogHeader>

          {detailLoading && (
            <div className="space-y-3 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          )}

          {detailOrder && (
            <div className="space-y-4 py-2">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>{' '}
                  <Badge variant="secondary" className={STATUS_COLOURS[detailOrder.status] ?? ''}>
                    {detailOrder.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Type:</span>{' '}
                  {ORDER_TYPE_LABELS[detailOrder.orderType] ?? detailOrder.orderType}
                </div>
                {detailOrder.tableNumber && (
                  <div>
                    <span className="text-muted-foreground">Table:</span> {detailOrder.tableNumber}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Staff:</span>{' '}
                  {detailOrder.staffName ?? '—'}
                </div>
                {detailOrder.customerName && (
                  <div>
                    <span className="text-muted-foreground">Customer:</span>{' '}
                    {detailOrder.customerName}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Date:</span>{' '}
                  {formatDate(detailOrder.createdAt)}
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="mb-2 text-sm font-medium">Items</h4>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Unit</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailOrder.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <span className="font-medium">{item.productName}</span>
                            {item.notes && (
                              <p className="text-xs text-muted-foreground">{item.notes}</p>
                            )}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(item.unitPrice)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(item.lineTotal)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Totals */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(detailOrder.subtotal)}</span>
                </div>
                {detailOrder.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="tabular-nums text-destructive">
                      -{formatCurrency(detailOrder.discountAmount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST</span>
                  <span className="tabular-nums">{formatCurrency(detailOrder.gst)}</span>
                </div>
                <div className="flex justify-between border-t pt-1 font-medium">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(detailOrder.total)}</span>
                </div>
              </div>

              {/* Payments */}
              {detailOrder.payments.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Payments</h4>
                  <div className="space-y-1">
                    {detailOrder.payments.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="capitalize">{p.method.replace('_', ' ')}</span>
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums">{formatCurrency(p.amount)}</span>
                          <Badge
                            variant="secondary"
                            className={
                              p.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-700'
                            }
                          >
                            {p.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {detailOrder.notes && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">Notes</h4>
                  <p className="text-sm text-muted-foreground">{detailOrder.notes}</p>
                </div>
              )}

              {/* Void action */}
              {detailOrder.status !== 'voided' && detailOrder.status !== 'cancelled' && (
                <div className="border-t pt-4">
                  {!voidConfirm ? (
                    <Button variant="destructive" size="sm" onClick={() => setVoidConfirm(true)}>
                      Void Order
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive font-medium">
                        Are you sure you want to void order {detailOrder.orderNumber}? This cannot
                        be undone.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={voiding}
                          onClick={handleVoidOrder}
                        >
                          {voiding ? 'Voiding...' : 'Yes, Void Order'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={voiding}
                          onClick={() => setVoidConfirm(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
