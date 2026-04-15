'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Plus, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { api, ApiClientError } from '@/lib/api';
import { PackForm, type Pack } from '@/components/pack-form';

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [customerCounts, setCustomerCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editPack, setEditPack] = useState<Pack | null>(null);

  const fetchPacks = useCallback(async () => {
    setLoading(true);
    try {
      const [packsRes, countsRes] = await Promise.all([
        api.get<Pack[]>('/prepaid-packs'),
        api.get<Record<string, number>>('/customers/pack-counts'),
      ]);
      setPacks(packsRes);
      setCustomerCounts(countsRes);
    } catch {
      toast.error('Failed to load packs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  function handleCreate() {
    setEditPack(null);
    setFormOpen(true);
  }

  function handleEdit(pack: Pack) {
    setEditPack(pack);
    setFormOpen(true);
  }

  async function handleToggleActive(pack: Pack) {
    const newVal = !pack.isActive;
    // Optimistic update
    setPacks((prev) => prev.map((p) => (p.id === pack.id ? { ...p, isActive: newVal } : p)));
    try {
      await api.put(`/prepaid-packs/${pack.id}`, { isActive: newVal });
      toast.success(`${pack.name} ${newVal ? 'activated' : 'deactivated'}.`);
    } catch {
      setPacks((prev) => prev.map((p) => (p.id === pack.id ? { ...p, isActive: !newVal } : p)));
      toast.error('Failed to update pack status.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Prepaid Packs</h2>
          <p className="text-sm text-muted-foreground">Manage prepaid coffee packs and bundles.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create Pack
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Per Item</TableHead>
              <TableHead>Savings</TableHead>
              <TableHead>Customers</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading && packs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-40 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Package className="h-8 w-8" />
                    <p className="text-sm">No packs yet. Create your first prepaid pack.</p>
                    <Button size="sm" variant="outline" onClick={handleCreate}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Create Pack
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              packs.map((pack) => {
                const fullPrice = pack.packSize * pack.perItemValue;
                const savings = fullPrice - pack.price;
                const pct = fullPrice > 0 ? ((savings / fullPrice) * 100).toFixed(0) : '0';
                const count = customerCounts[pack.id] ?? 0;

                return (
                  <TableRow key={pack.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{pack.name}</p>
                        {pack.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {pack.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{pack.packSize} items</TableCell>
                    <TableCell className="font-mono text-sm">
                      ${Number(pack.price).toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      ${Number(pack.perItemValue).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {savings > 0 ? (
                        <Badge variant="secondary" className="text-xs">
                          Save ${savings.toFixed(2)} ({pct}%)
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{count}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-1">
                        <Switch
                          checked={pack.isActive}
                          onCheckedChange={() => handleToggleActive(pack)}
                        />
                        {!pack.isActive && (
                          <span className="text-[10px] text-muted-foreground">
                            Existing balances remain
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(pack)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      <PackForm open={formOpen} onOpenChange={setFormOpen} pack={editPack} onSaved={fetchPacks} />
    </div>
  );
}
