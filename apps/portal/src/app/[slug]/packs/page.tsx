'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useOrg } from '../layout';
import { PackCard } from '@/components/pack-card';

interface Pack {
  id: string;
  name: string;
  description?: string | null;
  packSize: number;
  price: number;
  perItemValue: number;
  savings: number;
  allowCustomSize: boolean;
}

export default function PacksPage() {
  const org = useOrg();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Pack[]>(`/portal/${org.slug}/packs`)
      .then((data) => setPacks(data))
      .catch(() => toast.error('Failed to load packs.'))
      .finally(() => setLoading(false));
  }, [org.slug]);

  function handleBuy() {
    toast.info(`Visit ${org.name} to purchase this pack.`);
  }

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold">Prepaid Packs</h1>
      <p className="mt-1 text-sm text-muted-foreground">Save on your favourite items</p>

      {loading && (
        <div className="mt-6 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {!loading && packs.length === 0 && (
        <div className="mt-12 text-center">
          <p className="text-4xl">📦</p>
          <p className="mt-2 text-muted-foreground">No packs available right now.</p>
        </div>
      )}

      {!loading && packs.length > 0 && (
        <div className="mt-4 space-y-3">
          {packs.map((pack) => (
            <PackCard
              key={pack.id}
              name={pack.name}
              description={pack.description}
              packSize={pack.packSize}
              price={pack.price}
              perItemValue={pack.perItemValue}
              savings={pack.savings}
              onBuy={handleBuy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
