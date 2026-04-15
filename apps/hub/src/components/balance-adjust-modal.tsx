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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';

interface BalanceAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  balance: {
    id: string;
    packName: string;
    remainingCount: number;
    originalCount: number;
  };
  onAdjusted: () => void;
}

export function BalanceAdjustModal({
  open,
  onOpenChange,
  customerId,
  balance,
  onAdjusted,
}: BalanceAdjustModalProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const numAmount = parseInt(amount, 10);
  const newBalance = isNaN(numAmount) ? balance.remainingCount : balance.remainingCount + numAmount;

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!amount.trim() || isNaN(numAmount) || numAmount === 0) {
      next.amount = 'Enter a non-zero amount (e.g. +2 or -1)';
    }
    if (newBalance < 0) {
      next.amount = 'Cannot reduce balance below 0';
    }
    if (!reason.trim()) {
      next.reason = 'Reason is required';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleAdjust() {
    if (!validate()) return;

    setSaving(true);
    try {
      await api.post(`/customers/${customerId}/balances/adjust`, {
        customerBalanceId: balance.id,
        quantity: numAmount,
        reason: reason.trim(),
      });
      toast.success('Balance adjusted.');
      onAdjusted();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to adjust balance.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setAmount('');
          setReason('');
          setErrors({});
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Balance</DialogTitle>
          <DialogDescription>{balance.packName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label htmlFor="ba-amount" className="text-sm font-medium">
              Amount <span className="text-destructive">*</span>
            </label>
            <Input
              id="ba-amount"
              type="number"
              placeholder="+2 or -1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={saving}
              aria-invalid={!!errors.amount}
            />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
          </div>

          {amount && !isNaN(numAmount) && numAmount !== 0 && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              Will change balance from{' '}
              <span className="font-semibold">{balance.remainingCount}</span> to{' '}
              <span className="font-semibold">{newBalance}</span>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="ba-reason" className="text-sm font-medium">
              Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              id="ba-reason"
              placeholder="e.g. Complimentary credit, system correction"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={saving}
              rows={2}
              aria-invalid={!!errors.reason}
            />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleAdjust} disabled={saving}>
            {saving ? 'Adjusting...' : 'Adjust Balance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
