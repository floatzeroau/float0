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

export interface Pack {
  id: string;
  name: string;
  description?: string | null;
  packSize: number;
  price: number;
  perItemValue: number;
  eligibleProductIds?: string[] | null;
  isActive: boolean;
  allowCustomSize: boolean;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
}

interface PackFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pack: Pack | null;
  onSaved: () => void;
}

export function PackForm({ open, onOpenChange, pack, onSaved }: PackFormProps) {
  const isEdit = pack !== null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [packSize, setPackSize] = useState('');
  const [price, setPrice] = useState('');
  const [perItemValue, setPerItemValue] = useState('');
  const [autoPerItem, setAutoPerItem] = useState(true);
  const [allProducts, setAllProducts] = useState(true);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [allowCustomSize, setAllowCustomSize] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    api
      .get<Product[] | { data: Product[] }>('/products?limit=200')
      .then((res) => {
        const list = Array.isArray(res) ? res : res.data;
        setProducts(list);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (pack) {
      setName(pack.name);
      setDescription(pack.description ?? '');
      setPackSize(String(pack.packSize));
      setPrice(String(pack.price));
      setPerItemValue(String(pack.perItemValue));
      setAutoPerItem(false);
      setAllProducts(!pack.eligibleProductIds || pack.eligibleProductIds.length === 0);
      setSelectedProductIds(pack.eligibleProductIds ?? []);
      setAllowCustomSize(pack.allowCustomSize);
      setIsActive(pack.isActive);
    } else {
      setName('');
      setDescription('');
      setPackSize('');
      setPrice('');
      setPerItemValue('');
      setAutoPerItem(true);
      setAllProducts(true);
      setSelectedProductIds([]);
      setAllowCustomSize(false);
      setIsActive(true);
    }
    setErrors({});
  }, [open, pack]);

  // Auto-calculate per-item value
  useEffect(() => {
    if (!autoPerItem) return;
    const numSize = parseInt(packSize, 10);
    const numPrice = parseFloat(price);
    if (numSize > 0 && numPrice >= 0 && !isNaN(numSize) && !isNaN(numPrice)) {
      setPerItemValue((numPrice / numSize).toFixed(2));
    }
  }, [autoPerItem, packSize, price]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Name is required';
    const numSize = parseInt(packSize, 10);
    if (!packSize || isNaN(numSize) || numSize < 1) next.packSize = 'Enter a valid pack size';
    const numPrice = parseFloat(price);
    if (!price || isNaN(numPrice) || numPrice < 0) next.price = 'Enter a valid price';
    const numPerItem = parseFloat(perItemValue);
    if (!perItemValue || isNaN(numPerItem) || numPerItem < 0)
      next.perItemValue = 'Enter a valid per-item value';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        packSize: parseInt(packSize, 10),
        price: parseFloat(price),
        perItemValue: parseFloat(perItemValue),
        eligibleProductIds: allProducts ? null : selectedProductIds,
        isActive,
        allowCustomSize,
      };

      if (isEdit) {
        await api.put(`/prepaid-packs/${pack.id}`, payload);
        toast.success('Pack updated.');
      } else {
        await api.post('/prepaid-packs', payload);
        toast.success('Pack created.');
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? `Failed to ${isEdit ? 'update' : 'create'} pack.`);
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  // Savings preview
  const numSize = parseInt(packSize, 10);
  const numPrice = parseFloat(price);
  const numPerItem = parseFloat(perItemValue);
  const showSavings =
    !isNaN(numSize) && numSize > 0 && !isNaN(numPrice) && !isNaN(numPerItem) && numPerItem > 0;

  function toggleProduct(id: string) {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Pack' : 'Create Pack'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update prepaid pack details.' : 'Set up a new prepaid pack for customers.'}
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
              placeholder="10 Coffee Pack"
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
              placeholder="Prepaid pack of 10 coffees..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              rows={2}
            />
          </div>

          {/* Pack Size */}
          <div className="space-y-1">
            <label htmlFor="pf-size" className="text-sm font-medium">
              Pack Size <span className="text-destructive">*</span>
            </label>
            <Input
              id="pf-size"
              type="number"
              min="1"
              step="1"
              placeholder="10"
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
              disabled={saving}
              aria-invalid={!!errors.packSize}
            />
            {errors.packSize && <p className="text-xs text-destructive">{errors.packSize}</p>}
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
                placeholder="40.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={saving}
                className="pl-7"
                aria-invalid={!!errors.price}
              />
            </div>
            {errors.price && <p className="text-xs text-destructive">{errors.price}</p>}
          </div>

          {/* Per-Item Value */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="pf-peritem" className="text-sm font-medium">
                Per-Item Value <span className="text-destructive">*</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoPerItem}
                  onChange={(e) => setAutoPerItem(e.target.checked)}
                  disabled={saving}
                  className="h-3.5 w-3.5 rounded border-input accent-primary"
                />
                Auto-calculate
              </label>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="pf-peritem"
                type="number"
                step="0.01"
                min="0"
                placeholder="4.00"
                value={perItemValue}
                onChange={(e) => setPerItemValue(e.target.value)}
                disabled={saving || autoPerItem}
                className="pl-7"
                aria-invalid={!!errors.perItemValue}
              />
            </div>
            {errors.perItemValue && (
              <p className="text-xs text-destructive">{errors.perItemValue}</p>
            )}
          </div>

          {/* Savings Preview */}
          {showSavings && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              {(() => {
                // Assume average item price is the per-item value from a typical single purchase
                // We can show savings based on pack price vs full price
                const fullPrice = numSize * numPerItem;
                const savings = fullPrice - numPrice;
                if (savings > 0) {
                  const pct = ((savings / fullPrice) * 100).toFixed(0);
                  return `Customers save $${savings.toFixed(2)} per pack (${pct}% off)`;
                }
                return `$${numPerItem.toFixed(2)} per item`;
              })()}
            </div>
          )}

          {/* Eligible Products */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Eligible Products</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">All products</span>
                <Switch checked={allProducts} onCheckedChange={setAllProducts} disabled={saving} />
              </div>
            </div>
            {!allProducts && products.length > 0 && (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedProductIds.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      disabled={saving}
                      className="h-3.5 w-3.5 rounded border-input accent-primary"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Allow Custom Size */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow Custom Size</p>
              <p className="text-xs text-muted-foreground">
                Let customers buy a custom number of items.
              </p>
            </div>
            <Switch
              checked={allowCustomSize}
              onCheckedChange={setAllowCustomSize}
              disabled={saving}
            />
          </div>

          {/* Active */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Available for purchase.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} disabled={saving} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Pack'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
