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
import { ColourPicker } from '@/components/colour-picker';
import { Utensils } from 'lucide-react';
import { CategoryIcon, CATEGORY_ICON_NAMES } from '@/components/category-icon';
import { api, ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  colour: string;
  icon?: string | null;
  sortOrder: number;
  parentId?: string | null;
  orgId: string;
  productCount?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null; // null = create
  onSaved: () => void;
}

export function CategoryForm({ open, onOpenChange, category, onSaved }: CategoryFormProps) {
  const isEdit = category !== null;

  const [name, setName] = useState('');
  const [colour, setColour] = useState('#3b82f6');
  const [icon, setIcon] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');

  // Reset when opening
  useEffect(() => {
    if (!open) return;
    if (category) {
      setName(category.name);
      setColour(category.colour || '#3b82f6');
      setIcon(category.icon ?? '');
    } else {
      setName('');
      setColour('#3b82f6');
      setIcon('');
    }
    setNameError('');
  }, [open, category]);

  async function handleSave() {
    if (!name.trim()) {
      setNameError('Name is required');
      return;
    }
    setNameError('');
    setSaving(true);

    try {
      const payload = {
        name: name.trim(),
        colour,
        icon: icon || undefined,
      };

      if (isEdit) {
        await api.put(`/categories/${category.id}`, payload);
        toast.success('Category updated.');
      } else {
        await api.post('/categories', payload);
        toast.success('Category created.');
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? `Failed to ${isEdit ? 'update' : 'create'} category.`);
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Category' : 'Add Category'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the category details below.'
              : 'Create a new category for your products.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Preview */}
          <div className="flex items-center justify-center gap-2 rounded-lg border bg-muted/30 p-4">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: colour + '20' }}
            >
              {icon ? (
                <CategoryIcon name={icon} className="h-4 w-4" style={{ color: colour }} />
              ) : (
                <Utensils className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <span className="font-medium">{name || 'Category name'}</span>
            <span
              className="ml-1 inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: colour }}
            />
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="cf-name" className="text-sm font-medium">
              Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="cf-name"
              placeholder="e.g. Coffee, Pastries, Cold Drinks"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              aria-invalid={!!nameError}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>

          {/* Colour */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Colour</label>
            <ColourPicker value={colour} onChange={setColour} disabled={saving} />
          </div>

          {/* Icon */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Icon</label>
            <div className="grid grid-cols-10 gap-1.5">
              {CATEGORY_ICON_NAMES.map((iconName) => (
                <button
                  key={iconName}
                  type="button"
                  disabled={saving}
                  onClick={() => setIcon(icon === iconName ? '' : iconName)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                    icon === iconName
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-transparent text-muted-foreground',
                  )}
                >
                  <CategoryIcon name={iconName} className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
