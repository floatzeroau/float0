'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { api, ApiClientError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
  id: string;
  name: string;
}

interface AddedProduct {
  id: string;
  name: string;
  price: string;
  category: string;
}

const FALLBACK_CATEGORIES = ['Coffee', 'Tea', 'Cold Drinks', 'Food', 'Pastry'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface MenuSetupProps {
  onNext: () => void;
  onBack: () => void;
}

export function MenuSetup({ onNext, onBack }: MenuSetupProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<AddedProduct[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api
      .get<{ data: Category[] } | Category[]>('/categories')
      .then((res) => {
        const list = Array.isArray(res) ? res : res.data;
        if (list.length > 0) setCategories(list);
      })
      .catch(() => {
        // Use fallback categories
      });
  }, []);

  const categoryOptions =
    categories.length > 0 ? categories : FALLBACK_CATEGORIES.map((c) => ({ id: c, name: c }));

  async function handleAdd() {
    if (!name.trim() || !price.trim()) return;

    setAdding(true);
    try {
      const numericPrice = parseFloat(price);
      if (isNaN(numericPrice) || numericPrice < 0) {
        toast.error('Enter a valid price.');
        return;
      }

      const selectedCategory =
        categoryOptions.find((c) => c.id === categoryId) ?? categoryOptions[0];

      const result = await api.post<{ id: string }>('/products', {
        name: name.trim(),
        basePrice: numericPrice,
        categoryId: selectedCategory.id,
      });

      setProducts((prev) => [
        ...prev,
        {
          id: result?.id ?? crypto.randomUUID(),
          name: name.trim(),
          price: numericPrice.toFixed(2),
          category: selectedCategory.name,
        },
      ]);

      // Reset form
      setName('');
      setPrice('');
      toast.success(`"${name.trim()}" added.`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to add product.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setAdding(false);
    }
  }

  function handleRemove(id: string) {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    // Optionally DELETE from API — skip for onboarding simplicity
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set Up Your Menu</CardTitle>
        <CardDescription>Add your first few products to get started.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Quick-add form */}
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
            <div className="space-y-1">
              <label htmlFor="menu-name" className="text-sm font-medium">
                Product name
              </label>
              <Input
                id="menu-name"
                placeholder="Flat White"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={adding}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="menu-price" className="text-sm font-medium">
                Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  id="menu-price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="4.50"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={adding}
                  className="pl-7 w-24"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="menu-cat" className="text-sm font-medium">
                Category
              </label>
              <select
                id="menu-cat"
                value={categoryId || categoryOptions[0]?.id}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={adding}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={!name.trim() || !price.trim() || adding}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {adding ? 'Adding...' : 'Add product'}
          </Button>
        </div>

        {/* Product list */}
        {products.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>${p.price}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRemove(p.id)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {products.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            No products added yet. You can always add them later from the dashboard.
          </p>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onNext}>
              Skip this step
            </Button>
            <Button type="button" onClick={onNext} disabled={products.length === 0}>
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
