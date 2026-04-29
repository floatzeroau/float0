'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';

interface PackRefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  pack: {
    id: string;
    productName: string;
    remainingQuantity: number;
    unitValue: number;
  } | null;
  onRefunded: () => void;
}

export function PackRefundModal({
  open,
  onOpenChange,
  customerId,
  pack,
  onRefunded,
}: PackRefundModalProps) {
  const [saving, setSaving] = useState(false);

  const refundAmount = pack ? pack.remainingQuantity * pack.unitValue : 0;

  async function handleSubmit() {
    if (!pack) return;

    setSaving(true);
    try {
      await api.post(`/customers/${customerId}/packs/${pack.id}/refund`);
      toast.success(`Refunded $${refundAmount.toFixed(2)}.`);
      onRefunded();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to refund pack.');
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
          <DialogTitle>Refund Pack</DialogTitle>
          <DialogDescription>
            This will refund the remaining balance and mark the pack as refunded. The customer will
            no longer be able to redeem from it.
          </DialogDescription>
        </DialogHeader>

        {pack && (
          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
              <p className="font-medium">{pack.productName}</p>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Remaining items</span>
                <span>{pack.remainingQuantity}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Unit value</span>
                <span>${pack.unitValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 text-sm font-medium">
                <span>Refund amount</span>
                <span>${refundAmount.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              This action cannot be undone. Process the refund through your payment provider
              separately.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Refunding...' : `Refund $${refundAmount.toFixed(2)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
