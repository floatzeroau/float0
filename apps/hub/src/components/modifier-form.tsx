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
import { Switch } from '@/components/ui/switch';
import { api, ApiClientError } from '@/lib/api';
import type { Modifier } from '@/components/modifier-group-form';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ModifierFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modifier: Modifier | null; // null = create
  groupId: string;
  onSaved: () => void;
}

export function ModifierForm({
  open,
  onOpenChange,
  modifier,
  groupId,
  onSaved,
}: ModifierFormProps) {
  const isEdit = modifier !== null;

  const [name, setName] = useState('');
  const [priceStr, setPriceStr] = useState('0.00');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  // Reset form
  useEffect(() => {
    if (!open) return;
    if (modifier) {
      setName(modifier.name);
      setPriceStr((modifier.priceAdjustment / 100).toFixed(2));
      setIsDefault(modifier.isDefault);
    } else {
      setName('');
      setPriceStr('0.00');
      setIsDefault(false);
    }
    setNameError('');
  }, [open, modifier]);

  async function handleSave() {
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    setNameError('');
    setSaving(true);

    try {
      const priceAdjustment = Math.round(parseFloat(priceStr) * 100) || 0;

      const payload = {
        name: name.trim(),
        priceAdjustment,
        isDefault,
      };

      if (isEdit) {
        await api.put(`/modifiers/${modifier.id}`, payload);
        toast.success('Modifier updated.');
      } else {
        await api.post(`/modifier-groups/${groupId}/modifiers`, payload);
        toast.success('Modifier added.');
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? `Failed to ${isEdit ? 'update' : 'create'} modifier.`);
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Modifier' : 'Add Modifier'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update the modifier details.' : 'Add a new option to this group.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="mod-name" className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="mod-name"
              placeholder="e.g. Oat Milk, Large"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              aria-invalid={!!nameError}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          {/* Price adjustment */}
          <div className="space-y-1">
            <label htmlFor="mod-price" className="text-sm font-medium">
              Price adjustment
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="mod-price"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                disabled={saving}
                className="pl-7"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use positive for surcharge, negative for discount, 0 for no change.
            </p>
          </div>

          {/* Default toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Default selection</p>
              <p className="text-xs text-muted-foreground">Pre-selected when ordering.</p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} disabled={saving} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Modifier'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
