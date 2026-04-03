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
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModifierGroup {
  id: string;
  name: string;
  displayName: string;
  selectionType: 'single' | 'multiple';
  minSelections: number;
  maxSelections: number;
  modifiers?: Modifier[];
  productCount?: number;
}

export interface Modifier {
  id: string;
  name: string;
  priceAdjustment: number; // cents
  isDefault: boolean;
  modifierGroupId: string;
  sortOrder: number;
}

interface Product {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ModifierGroupFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: ModifierGroup | null; // null = create
  onSaved: () => void;
}

export function ModifierGroupForm({ open, onOpenChange, group, onSaved }: ModifierGroupFormProps) {
  const isEdit = group !== null;

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectionType, setSelectionType] = useState<'required' | 'optional'>('optional');
  const [minSelections, setMinSelections] = useState('0');
  const [maxSelections, setMaxSelections] = useState('1');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  // Product linking
  const [products, setProducts] = useState<Product[]>([]);
  const [linkedProductIds, setLinkedProductIds] = useState<string[]>([]);

  // Fetch products for linking
  useEffect(() => {
    if (!open) return;
    api
      .get<Product[] | { data: Product[] }>('/products')
      .then((res) => {
        const list = Array.isArray(res) ? res : res.data;
        setProducts(list);
      })
      .catch(() => {});
  }, [open]);

  // Reset form
  useEffect(() => {
    if (!open) return;
    if (group) {
      setName(group.name);
      setDisplayName(group.displayName);
      setSelectionType(group.selectionType === 'single' ? 'required' : 'optional');
      setMinSelections(String(group.minSelections));
      setMaxSelections(String(group.maxSelections));
    } else {
      setName('');
      setDisplayName('');
      setSelectionType('optional');
      setMinSelections('0');
      setMaxSelections('1');
    }
    setLinkedProductIds([]);
    setNameError('');
  }, [open, group]);

  // Fetch linked products when editing
  useEffect(() => {
    if (!open || !group) return;
    api
      .get<string[] | { productIds: string[] }>(`/modifier-groups/${group.id}/products`)
      .then((res) => {
        const ids = Array.isArray(res) ? res : res.productIds;
        setLinkedProductIds(ids);
      })
      .catch(() => {});
  }, [open, group]);

  function toggleProduct(id: string) {
    setLinkedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    setNameError('');
    setSaving(true);

    try {
      const apiSelectionType = selectionType === 'required' ? 'single' : 'multiple';
      const apiMinSelections = selectionType === 'required' ? 1 : 0;
      const apiMaxSelections = selectionType === 'required' ? 1 : parseInt(maxSelections, 10) || 1;

      const payload = {
        name: name.trim(),
        displayName: displayName.trim() || name.trim(),
        selectionType: apiSelectionType,
        minSelections: apiMinSelections,
        maxSelections: apiMaxSelections,
        productIds: linkedProductIds.length > 0 ? linkedProductIds : undefined,
      };

      if (isEdit) {
        await api.put(`/modifier-groups/${group.id}`, payload);
        toast.success('Modifier group updated.');
      } else {
        await api.post('/modifier-groups', payload);
        toast.success('Modifier group created.');
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? `Failed to ${isEdit ? 'update' : 'create'} modifier group.`);
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
          <DialogTitle>{isEdit ? 'Edit Modifier Group' : 'Add Modifier Group'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the modifier group details.'
              : 'Create a group to hold related modifiers (e.g. Milk Options, Sizes).'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="mg-name" className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="mg-name"
              placeholder="e.g. Milk Options"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              aria-invalid={!!nameError}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          {/* Display name */}
          <div className="space-y-1">
            <label htmlFor="mg-display" className="text-sm font-medium">
              Display name
            </label>
            <Input
              id="mg-display"
              placeholder="Shown to customers (defaults to name)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* Selection type */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Selection type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectionType('required');
                  if (minSelections === '0') setMinSelections('1');
                }}
                disabled={saving}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  selectionType === 'required'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:text-foreground'
                }`}
              >
                Required
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectionType('optional');
                  setMinSelections('0');
                }}
                disabled={saving}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  selectionType === 'optional'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground hover:text-foreground'
                }`}
              >
                Optional
              </button>
            </div>
          </div>

          {/* Min / Max selections */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="mg-min" className="text-sm font-medium">
                Min selections
              </label>
              <Input
                id="mg-min"
                type="number"
                min="0"
                value={minSelections}
                onChange={(e) => setMinSelections(e.target.value)}
                disabled={saving || selectionType === 'optional'}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="mg-max" className="text-sm font-medium">
                Max selections
              </label>
              <Input
                id="mg-max"
                type="number"
                min="1"
                value={maxSelections}
                onChange={(e) => setMaxSelections(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>

          {/* Link products */}
          {products.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Link to products</label>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={linkedProductIds.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      disabled={saving}
                      className="h-3.5 w-3.5 rounded border-input accent-primary"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {linkedProductIds.length} product{linkedProductIds.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
