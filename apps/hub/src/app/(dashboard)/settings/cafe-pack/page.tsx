'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api, ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';

type ExpiryMode = 'none' | 'fixed' | 'custom';

interface CafePackSettings {
  enabled: boolean;
  expiryMode: ExpiryMode;
  expiryDays: number | null;
}

interface OrgSettings {
  cafePack?: Partial<CafePackSettings>;
}

const PRESET_DAYS = [30, 60, 90];

export default function CafePackSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [expiryMode, setExpiryMode] = useState<ExpiryMode>('none');
  const [expiryDays, setExpiryDays] = useState<string>('30');

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api
      .get<OrgSettings>('/organizations/me/settings')
      .then((settings) => {
        const cp = settings.cafePack ?? {};
        setEnabled(cp.enabled ?? false);
        setExpiryMode(cp.expiryMode ?? 'none');
        if (cp.expiryDays != null) setExpiryDays(String(cp.expiryDays));
      })
      .catch(() => toast.error('Failed to load Cafe Pack settings.'))
      .finally(() => setLoading(false));
  }, []);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (expiryMode !== 'none') {
      const n = parseInt(expiryDays, 10);
      if (!expiryDays.trim() || isNaN(n) || n < 1) {
        next.expiryDays = 'Enter a valid number of days';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    setSaving(true);
    try {
      await api.patch('/organizations/me/settings', {
        cafePack: {
          enabled,
          expiryMode,
          expiryDays: expiryMode === 'none' ? null : parseInt(expiryDays, 10),
        },
      });
      toast.success('Cafe Pack settings saved.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to save Cafe Pack settings.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Cafe Pack</CardTitle>
          <CardDescription>
            Sell prepaid packs of coffees and other items. Customers can redeem from their balance
            at the POS or via the customer portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Cafe Pack</p>
              <p className="text-xs text-muted-foreground">
                When enabled, products marked &ldquo;Allow as Cafe Pack&rdquo; can be sold as packs.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} disabled={saving} />
          </div>

          <fieldset className={cn('space-y-3', !enabled && 'opacity-50 pointer-events-none')}>
            <legend className="text-sm font-medium">Expiry Policy</legend>
            <p className="text-xs text-muted-foreground -mt-2">
              How long do pack items remain redeemable after purchase?
            </p>
            <div className="space-y-2">
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                <input
                  type="radio"
                  name="expiry-mode"
                  value="none"
                  checked={expiryMode === 'none'}
                  onChange={() => setExpiryMode('none')}
                  disabled={saving || !enabled}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">Never expire</p>
                  <p className="text-xs text-muted-foreground">
                    Pack items remain redeemable forever.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                <input
                  type="radio"
                  name="expiry-mode"
                  value="fixed"
                  checked={expiryMode === 'fixed'}
                  onChange={() => setExpiryMode('fixed')}
                  disabled={saving || !enabled}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">Fixed expiry</p>
                  <p className="text-xs text-muted-foreground">
                    All packs expire a set number of days after purchase.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
                <input
                  type="radio"
                  name="expiry-mode"
                  value="custom"
                  checked={expiryMode === 'custom'}
                  onChange={() => setExpiryMode('custom')}
                  disabled={saving || !enabled}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">Custom per pack</p>
                  <p className="text-xs text-muted-foreground">
                    Default expiry can be overridden when selling individual packs.
                  </p>
                </div>
              </label>
            </div>

            {expiryMode !== 'none' && (
              <div className="space-y-1 pt-2">
                <label htmlFor="cp-days" className="text-sm font-medium">
                  {expiryMode === 'fixed' ? 'Expiry (days)' : 'Default expiry (days)'}
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="cp-days"
                    type="number"
                    min={1}
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    disabled={saving || !enabled}
                    className="w-32"
                    aria-invalid={!!errors.expiryDays}
                  />
                  <div className="flex gap-1">
                    {PRESET_DAYS.map((d) => (
                      <Button
                        key={d}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setExpiryDays(String(d))}
                        disabled={saving || !enabled}
                      >
                        {d}d
                      </Button>
                    ))}
                  </div>
                </div>
                {errors.expiryDays && (
                  <p className="text-xs text-destructive">{errors.expiryDays}</p>
                )}
              </div>
            )}
          </fieldset>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
