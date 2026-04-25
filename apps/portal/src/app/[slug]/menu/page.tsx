'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  description?: string | null;
  basePrice: number;
  isAvailable: boolean;
}

interface Category {
  id: string;
  name: string;
  colour?: string | null;
  icon?: string | null;
  products: Product[];
}

export default function MenuPage() {
  const org = useOrg();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Category[]>(`/portal/${org.slug}/menu`)
      .then((data) => {
        setCategories(data);
        if (data.length > 0) setActiveCategory(data[0].id);
      })
      .catch(() => toast.error('Failed to load menu.'))
      .finally(() => setLoading(false));
  }, [org.slug]);

  const activeProducts = categories.find((c) => c.id === activeCategory)?.products ?? [];

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold">Menu</h1>
      <p className="mt-1 text-sm text-muted-foreground">{org.name}</p>

      {loading && (
        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-9 w-20 animate-pulse rounded-full bg-muted" />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {!loading && categories.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-4xl">📋</p>
          <p className="mt-2 text-muted-foreground">Menu is being prepared. Check back soon!</p>
        </div>
      )}

      {!loading && categories.length > 0 && (
        <>
          {/* Category tabs - horizontal scroll */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="mt-4 grid grid-cols-1 gap-3">
            {activeProducts.map((product) => (
              <Card key={product.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="font-medium">{product.name}</h3>
                    {product.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                        {product.description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold">
                    ${product.basePrice.toFixed(2)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
