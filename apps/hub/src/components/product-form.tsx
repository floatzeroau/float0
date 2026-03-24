'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api, ApiClientError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  basePrice: number; // cents
  sku?: string | null;
  barcode?: string | null;
  isAvailable: boolean;
  isGstFree: boolean;
  sortOrder: number;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string; color?: string | null } | null;
  modifierGroups?: { id: string; name: string }[];
}

export interface Category {
  id: string;
  name: string;
  color?: string | null;
}

interface ModifierGroup {
  id: string;
  name: string;
}

interface ProductFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null; // null = create mode
  categories: Category[];
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateSku(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6)
    .padEnd(3, 'X');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductForm({
  open,
  onOpenChange,
  product,
  categories,
  onSaved,
}: ProductFormProps) {
  const isEdit = product !== null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [sku, setSku] = useState('');
  const [autoSku, setAutoSku] = useState(true);
  const [isGstFree, setIsGstFree] = useState(false);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [selectedModifierGroups, setSelectedModifierGroups] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch modifier groups on open
  useEffect(() => {
    if (!open) return;
    api
      .get<ModifierGroup[] | { data: ModifierGroup[] }>('/modifier-groups')
      .then((res) => {
        const list = Array.isArray(res) ? res : res.data;
        setModifierGroups(list);
      })
      .catch(() => {});
  }, [open]);

  // Reset form when opening
  useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name);
      setDescription(product.description ?? '');
      setCategoryId(product.categoryId ?? '');
      setPrice((product.basePrice / 100).toFixed(2));
      setSku(product.sku ?? '');
      setAutoSku(false);
      setIsGstFree(product.isGstFree);
      setSelectedModifierGroups(product.modifierGroups?.map((mg) => mg.id) ?? []);
    } else {
      setName('');
      setDescription('');
      setCategoryId(categories[0]?.id ?? '');
      setPrice('');
      setSku('');
      setAutoSku(true);
      setIsGstFree(false);
      setSelectedModifierGroups([]);
    }
    setErrors({});
  }, [open, product, categories]);

  // Auto-generate SKU
  useEffect(() => {
    if (autoSku && name.trim()) {
      setSku(generateSku(name));
    }
  }, [autoSku, name]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Name is required';
    const numPrice = parseFloat(price);
    if (!price.trim() || isNaN(numPrice) || numPrice < 0) {
      next.price = 'Enter a valid price';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function toggleModifierGroup(id: string) {
    setSelectedModifierGroups((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        categoryId: categoryId || undefined,
        basePrice: Math.round(parseFloat(price) * 100),
        sku: sku.trim() || undefined,
        isGstFree,
        modifierGroupIds: selectedModifierGroups.length > 0 ? selectedModifierGroups : undefined,
      };

      if (isEdit) {
        await api.put(`/products/${product.id}`, payload);
        toast.success('Product updated.');
      } else {
        await api.post('/products', payload);
        toast.success('Product created.');
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? `Failed to ${isEdit ? 'update' : 'create'} product.`);
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Product' : 'Add Product'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the product details below.'
              : 'Fill in the details to add a new product.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="pf-name" className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="pf-name"
              placeholder="Flat White"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label htmlFor="pf-desc" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="pf-desc"
              placeholder="A smooth and creamy coffee..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              rows={3}
            />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label htmlFor="pf-cat" className="text-sm font-medium">
              Category
            </label>
            <select
              id="pf-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={saving}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Price */}
          <div className="space-y-1">
            <label htmlFor="pf-price" className="text-sm font-medium">
              Price <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="pf-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="4.50"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={saving}
                className="pl-7"
                aria-invalid={!!errors.price}
              />
            </div>
            {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
          </div>

          {/* SKU */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="pf-sku" className="text-sm font-medium">
                SKU
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoSku}
                  onChange={(e) => setAutoSku(e.target.checked)}
                  disabled={saving}
                  className="h-3.5 w-3.5 rounded border-input accent-primary"
                />
                Auto-generate
              </label>
            </div>
            <Input
              id="pf-sku"
              placeholder="FW001"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              disabled={saving || autoSku}
            />
          </div>

          {/* GST Free */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">GST Free</p>
              <p className="text-xs text-muted-foreground">Exempt this product from GST.</p>
            </div>
            <Switch checked={isGstFree} onCheckedChange={setIsGstFree} disabled={saving} />
          </div>

          {/* Modifier Groups */}
          {modifierGroups.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Modifier Groups</p>
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                {modifierGroups.map((mg) => (
                  <label key={mg.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedModifierGroups.includes(mg.id)}
                      onChange={() => toggleModifierGroup(mg.id)}
                      disabled={saving}
                      className="h-3.5 w-3.5 rounded border-input accent-primary"
                    />
                    {mg.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
