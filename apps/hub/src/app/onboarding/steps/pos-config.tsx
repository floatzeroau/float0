'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { api, ApiClientError } from '@/lib/api';
import type { OrgData } from '../page';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PosConfigProps {
  org: OrgData | null;
  onNext: () => void;
  onBack: () => void;
}

export function PosConfig({ org, onNext, onBack }: PosConfigProps) {
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const posSettings = (settings.pos as Record<string, unknown>) ?? {};
  const receiptSettings = (settings.receipt as Record<string, unknown>) ?? {};

  const [saving, setSaving] = useState(false);
  const [defaultOrderType, setDefaultOrderType] = useState<'dine_in' | 'takeaway'>(
    (posSettings.defaultOrderType as 'dine_in' | 'takeaway') ?? 'dine_in',
  );
  const [tippingEnabled, setTippingEnabled] = useState(
    (posSettings.tippingEnabled as boolean) ?? true,
  );
  const [tipPercentages, setTipPercentages] = useState<[string, string, string]>(() => {
    const saved = posSettings.tipPercentages as number[] | undefined;
    return saved && saved.length === 3
      ? [String(saved[0]), String(saved[1]), String(saved[2])]
      : ['10', '15', '20'];
  });
  const [cashRounding, setCashRounding] = useState(
    (posSettings.cashRoundingEnabled as boolean) ?? true,
  );
  const [receiptFooter, setReceiptFooter] = useState(
    (receiptSettings.footerText as string) ?? 'Thank you for visiting!',
  );

  function handleTipChange(index: number, value: string) {
    setTipPercentages((prev) => {
      const next = [...prev] as [string, string, string];
      next[index] = value;
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch('/organizations/me/settings', {
        pos: {
          defaultOrderType,
          tippingEnabled,
          tipPercentages: tipPercentages.map((t) => parseInt(t, 10) || 0),
          cashRoundingEnabled: cashRounding,
        },
        receipt: {
          footerText: receiptFooter,
        },
      });
      onNext();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to save POS settings.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>POS Configuration</CardTitle>
        <CardDescription>Configure how your point-of-sale system works.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Default order type */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Default order type</p>
            <p className="text-xs text-muted-foreground">
              Set the default when creating a new order.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-1">
            <button
              type="button"
              onClick={() => setDefaultOrderType('dine_in')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                defaultOrderType === 'dine_in'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Dine-in
            </button>
            <button
              type="button"
              onClick={() => setDefaultOrderType('takeaway')}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                defaultOrderType === 'takeaway'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Takeaway
            </button>
          </div>
        </div>

        {/* Tipping */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable tipping</p>
              <p className="text-xs text-muted-foreground">
                Show tip options on the payment screen.
              </p>
            </div>
            <Switch checked={tippingEnabled} onCheckedChange={setTippingEnabled} />
          </div>
          {tippingEnabled && (
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Tip percentages</label>
              <div className="flex gap-3">
                {tipPercentages.map((val, i) => (
                  <div key={i} className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={val}
                      onChange={(e) => handleTipChange(i, e.target.value)}
                      className="w-20 pr-7"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cash rounding */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Cash rounding</p>
            <p className="text-xs text-muted-foreground">
              Round cash payments to the nearest 5 cents.
            </p>
          </div>
          <Switch checked={cashRounding} onCheckedChange={setCashRounding} />
        </div>

        {/* Receipt footer */}
        <div className="space-y-1">
          <label htmlFor="pos-footer" className="text-sm font-medium">
            Receipt footer message
          </label>
          <Textarea
            id="pos-footer"
            placeholder="Thank you for visiting!"
            value={receiptFooter}
            onChange={(e) => setReceiptFooter(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">Printed at the bottom of every receipt.</p>
        </div>

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onNext}>
              Skip this step
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Next'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
