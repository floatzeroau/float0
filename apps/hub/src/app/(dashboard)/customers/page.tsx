'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  UserX,
  Users,
} from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api, ApiClientError } from '@/lib/api';
import { CustomerForm, type Customer } from '@/components/customer-form';
import { CustomerDetailModal } from '@/components/customer-detail-modal';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

type SortField = 'name' | 'totalSpent' | 'visitCount' | 'lastVisit';
type SortOrder = 'asc' | 'desc';

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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Customer | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      params.set('sort', sortField);
      params.set('dir', sortOrder);
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const qs = params.toString();
      const res = await api.get<{ data: Customer[]; total: number }>(
        `/customers${qs ? `?${qs}` : ''}`,
      );
      setCustomers(res.data);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load customers.');
    } finally {
      setLoading(false);
    }
  }, [search, sortField, sortOrder, page]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  useEffect(() => {
    setPage(1);
  }, [search, sortField, sortOrder]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  function handleCreate() {
    setEditCustomer(null);
    setFormOpen(true);
  }

  function handleEdit(customer: Customer) {
    setEditCustomer(customer);
    setFormOpen(true);
  }

  function handleClickCustomer(customer: Customer) {
    setDetailCustomerId(customer.id);
    setDetailOpen(true);
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await api.delete(`/customers/${deactivateTarget.id}`);
      toast.success(`${deactivateTarget.firstName} ${deactivateTarget.lastName} deactivated.`);
      setDeactivateTarget(null);
      setDetailOpen(false);
      fetchCustomers();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to deactivate customer.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setDeactivating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function SortButton({ field, children }: { field: SortField; children: React.ReactNode }) {
    const active = sortField === field;
    return (
      <button
        type="button"
        onClick={() => handleSort(field)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {children}
        <ArrowUpDown
          className={cn('h-3.5 w-3.5', active ? 'text-foreground' : 'text-muted-foreground/40')}
        />
      </button>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading...' : `${total} customer${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton field="name">Name</SortButton>
              </TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Pack Balance</TableHead>
              <TableHead>
                <SortButton field="totalSpent">Total Spent</SortButton>
              </TableHead>
              <TableHead>
                <SortButton field="visitCount">Visits</SortButton>
              </TableHead>
              <TableHead>
                <SortButton field="lastVisit">Last Visit</SortButton>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-10" />
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

            {!loading && customers.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-8 w-8" />
                    <p className="text-sm">
                      {search
                        ? 'No customers match your search.'
                        : 'No customers yet. Add your first customer to get started.'}
                    </p>
                    {!search && (
                      <Button size="sm" variant="outline" onClick={handleCreate}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add Customer
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              customers.map((customer) => {
                const initials = `${customer.firstName[0]}${customer.lastName[0]}`.toUpperCase();
                return (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer"
                    onClick={() => handleClickCustomer(customer)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                          {initials}
                        </span>
                        <span className="font-medium">
                          {customer.firstName} {customer.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {customer.email || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {customer.phone || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {customer.coffeeBalance > 0 ? (
                        <Badge variant="secondary" className="font-mono">
                          ☕ {customer.coffeeBalance}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      ${Number(customer.totalSpent).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">{customer.visitCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {customer.lastVisit ? relativeTime(customer.lastVisit) : 'Never'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>
                        {customer.status}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(customer)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeactivateTarget(customer)}
                            className="text-destructive focus:text-destructive"
                          >
                            <UserX className="mr-2 h-4 w-4" />
                            Deactivate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create/Edit form */}
      <CustomerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editCustomer}
        onSaved={() => {
          fetchCustomers();
          if (detailOpen && detailCustomerId) {
            // Force detail modal to refetch
            setDetailCustomerId(null);
            setTimeout(() => setDetailCustomerId(editCustomer?.id ?? null), 0);
          }
        }}
      />

      {/* Customer detail modal */}
      <CustomerDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        customerId={detailCustomerId}
        onEdit={() => {
          const c = customers.find((c) => c.id === detailCustomerId);
          if (c) {
            setDetailOpen(false);
            handleEdit(c);
          }
        }}
        onDeactivate={() => {
          const c = customers.find((c) => c.id === detailCustomerId);
          if (c) {
            setDetailOpen(false);
            setDeactivateTarget(c);
          }
        }}
        onRefresh={fetchCustomers}
      />

      {/* Deactivate confirmation */}
      <Dialog open={!!deactivateTarget} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate customer</DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate{' '}
              <strong>
                {deactivateTarget?.firstName} {deactivateTarget?.lastName}
              </strong>
              ? They will no longer appear in active customer lists.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
              disabled={deactivating}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={deactivating}>
              {deactivating ? 'Deactivating...' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
