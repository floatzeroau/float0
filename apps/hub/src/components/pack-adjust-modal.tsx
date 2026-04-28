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
import { api, ApiClientError } from '@/lib/api';

interface PackAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  pack: {
    id: string;
    productName: string;
    remainingQuantity: number;
  } | null;
  onAdjusted: () => void;
}

export function PackAdjustModal({
  open,
  onOpenChange,
  customerId,
  pack,
  onAdjusted,
}: PackAdjustModalProps) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDelta('');
      setReason('');
      setErrors({});
    }
  }, [open]);

  const deltaNum = parseInt(delta, 10);
  const previewRemaining =
    pack && !isNaN(deltaNum) ? pack.remainingQuantity + deltaNum : (pack?.remainingQuantity ?? 0);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!delta.trim() || isNaN(deltaNum) || deltaNum === 0) {
      next.delta = 'Enter a non-zero quantity change';
    } else if (pack && pack.remainingQuantity + deltaNum < 0) {
      next.delta = `Cannot reduce below 0 (currently ${pack.remainingQuantity} remaining)`;
    }
    if (!reason.trim()) next.reason = 'Reason is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!pack || !validate()) return;

    setSaving(true);
    try {
      await api.post(`/customers/${customerId}/packs/${pack.id}/adjust`, {
        quantityDelta: deltaNum,
        reason: reason.trim(),
      });
      toast.success('Pack adjusted.');
      onAdjusted();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to adjust pack.');
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
          <DialogTitle>Adjust Pack</DialogTitle>
          <DialogDescription>
            Manually add or remove items from this pack. All adjustments are logged.
          </DialogDescription>
        </DialogHeader>

        {pack && (
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{pack.productName}</p>
              <p className="text-xs text-muted-foreground">
                Currently {pack.remainingQuantity} remaining
              </p>
            </div>

            <div className="space-y-1">
              <label htmlFor="adj-delta" className="text-sm font-medium">
                Quantity change <span className="text-destructive">*</span>
              </label>
              <Input
                id="adj-delta"
                type="number"
                step="1"
                placeholder="e.g. -1 or 2"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                disabled={saving}
                aria-invalid={!!errors.delta}
              />
              <p className="text-xs text-muted-foreground">
                Use negative numbers to remove. New balance: <strong>{previewRemaining}</strong>
              </p>
              {errors.delta && <p className="text-xs text-destructive">{errors.delta}</p>}
            </div>

            <div className="space-y-1">
              <label htmlFor="adj-reason" className="text-sm font-medium">
                Reason <span className="text-destructive">*</span>
              </label>
              <Textarea
                id="adj-reason"
                placeholder="e.g. Customer disputed serve, manual top-up..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={saving}
                rows={3}
                aria-invalid={!!errors.reason}
              />
              {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Adjusting...' : 'Adjust Pack'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
