'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { ProductForm, type Product, type Category } from '@/components/product-form';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

type SortField = 'name' | 'basePrice' | 'createdAt';
type SortOrder = 'asc' | 'desc';
type AvailabilityFilter = 'all' | 'available' | 'unavailable';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProductsPage() {
  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters & sort
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [page, setPage] = useState(1);

  // Dialogs
  const [formOpen, setFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch categories once
  // -------------------------------------------------------------------------
  useEffect(() => {
    api
      .get<Category[] | { data: Category[] }>('/categories')
      .then((res) => {
        const list = Array.isArray(res) ? res : res.data;
        setCategories(list);
      })
      .catch(() => {});
  }, []);

  // -------------------------------------------------------------------------
  // Fetch products
  // -------------------------------------------------------------------------
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (categoryFilter) params.set('categoryId', categoryFilter);
      if (availabilityFilter === 'available') params.set('isAvailable', 'true');
      if (availabilityFilter === 'unavailable') params.set('isAvailable', 'false');
      params.set('sortBy', sortField);
      params.set('sortDir', sortOrder);
      params.set('offset', String((page - 1) * PAGE_SIZE));
      params.set('limit', String(PAGE_SIZE));

      const qs = params.toString();
      const res = await api.get<Product[] | { data: Product[]; total?: number }>(
        `/products${qs ? `?${qs}` : ''}`,
      );

      if (Array.isArray(res)) {
        setProducts(res);
        setTotal(res.length);
      } else {
        setProducts(res.data);
        setTotal(res.total ?? res.data.length);
      }
    } catch {
      toast.error('Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, availabilityFilter, sortField, sortOrder, page]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Debounced search — reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, availabilityFilter, sortField, sortOrder]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  function handleCreate() {
    setEditProduct(null);
    setFormOpen(true);
  }

  function handleEdit(product: Product) {
    setEditProduct(product);
    setFormOpen(true);
  }

  async function handleToggleAvailability(product: Product) {
    const newVal = !product.isAvailable;
    // Optimistic update
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, isAvailable: newVal } : p)),
    );
    try {
      await api.patch(`/products/${product.id}/availability`);
      toast.success(`${product.name} ${newVal ? 'available' : "86'd"}.`);
    } catch {
      // Revert
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, isAvailable: !newVal } : p)),
      );
      toast.error('Failed to update availability.');
    }
  }

  async function handleDuplicate(product: Product) {
    try {
      await api.post(`/products/${product.id}/duplicate`);
      toast.success(`"${product.name}" duplicated.`);
      fetchProducts();
    } catch {
      toast.error('Failed to duplicate product.');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/products/${deleteTarget.id}`);
      toast.success(`"${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      fetchProducts();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to delete product.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setDeleting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  function formatPrice(dollars: number): string {
    return `$${dollars.toFixed(2)}`;
  }

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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Manage your menu items and pricing.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Product
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={availabilityFilter}
          onChange={(e) => setAvailabilityFilter(e.target.value as AvailabilityFilter)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="all">All availability</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortButton field="name">Name</SortButton>
              </TableHead>
              <TableHead>Category</TableHead>
              <TableHead>
                <SortButton field="basePrice">Price</SortButton>
              </TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Available</TableHead>
              <TableHead className="text-right">
                <SortButton field="createdAt">Created</SortButton>
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading && products.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <p className="text-sm">
                      {search || categoryFilter || availabilityFilter !== 'all'
                        ? 'No products match your filters.'
                        : 'No products yet. Add your first product to get started.'}
                    </p>
                    {!search && !categoryFilter && availabilityFilter === 'all' && (
                      <Button size="sm" variant="outline" onClick={handleCreate}>
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add Product
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              products.map((product) => {
                const cat =
                  product.category ??
                  (product.categoryId ? categoryMap.get(product.categoryId) : null);
                return (
                  <TableRow
                    key={product.id}
                    className="cursor-pointer"
                    onClick={() => handleEdit(product)}
                  >
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{product.name}</p>
                          {product.allowAsPack && (
                            <Badge
                              variant="secondary"
                              className="bg-amber-100 text-amber-800 hover:bg-amber-100"
                            >
                              Pack
                            </Badge>
                          )}
                        </div>
                        {product.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {product.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {cat ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: cat.colour ?? '#94a3b8' }}
                          />
                          <span className="text-sm">{cat.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatPrice(product.basePrice)}
                    </TableCell>
                    <TableCell>
                      {product.sku ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          {product.sku}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Switch
                        checked={product.isAvailable}
                        onCheckedChange={() => handleToggleAvailability(product)}
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {new Date(product.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(product)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDuplicate(product)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(product)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
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

      {/* Create/Edit form dialog */}
      <ProductForm
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editProduct}
        categories={categories}
        onSaved={fetchProducts}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteTarget?.name}&quot;? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
