'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Receipt } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api, ApiClientError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgData {
  id: string;
  name: string;
  settings?: Record<string, unknown>;
}

interface PosSettings {
  default_order_type: 'dine_in' | 'takeaway';
  tipping_enabled: boolean;
  tip_percentages: [number, number, number];
  cash_rounding: boolean;
  order_prefix: string;
  order_starting_number: number;
}

interface ReceiptSettings {
  header_text: string;
  footer_text: string;
  instagram: string;
  facebook: string;
}

const DEFAULT_POS: PosSettings = {
  default_order_type: 'dine_in',
  tipping_enabled: true,
  tip_percentages: [10, 15, 20],
  cash_rounding: true,
  order_prefix: 'ORD-',
  order_starting_number: 1,
};

const DEFAULT_RECEIPT: ReceiptSettings = {
  header_text: '',
  footer_text: 'Thank you for visiting!',
  instagram: '',
  facebook: '',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PosConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgName, setOrgName] = useState('');

  // POS settings
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>(
    DEFAULT_POS.default_order_type,
  );
  const [tippingEnabled, setTippingEnabled] = useState(DEFAULT_POS.tipping_enabled);
  const [tips, setTips] = useState<[string, string, string]>(['10', '15', '20']);
  const [cashRounding, setCashRounding] = useState(DEFAULT_POS.cash_rounding);
  const [orderPrefix, setOrderPrefix] = useState(DEFAULT_POS.order_prefix);
  const [orderStart, setOrderStart] = useState(String(DEFAULT_POS.order_starting_number));

  // Receipt settings
  const [headerText, setHeaderText] = useState(DEFAULT_RECEIPT.header_text);
  const [footerText, setFooterText] = useState(DEFAULT_RECEIPT.footer_text);
  const [instagram, setInstagram] = useState(DEFAULT_RECEIPT.instagram);
  const [facebook, setFacebook] = useState(DEFAULT_RECEIPT.facebook);

  // -------------------------------------------------------------------------
  // Fetch
  // -------------------------------------------------------------------------

  useEffect(() => {
    api
      .get<OrgData>('/organizations/me')
      .then((org) => {
        setOrgName(org.name ?? '');
        const s = org.settings ?? {};

        // POS
        const pos = (s.pos ?? {}) as Partial<PosSettings>;
        if (pos.default_order_type) setOrderType(pos.default_order_type);
        if (typeof pos.tipping_enabled === 'boolean') setTippingEnabled(pos.tipping_enabled);
        if (Array.isArray(pos.tip_percentages) && pos.tip_percentages.length === 3) {
          setTips([
            String(pos.tip_percentages[0]),
            String(pos.tip_percentages[1]),
            String(pos.tip_percentages[2]),
          ]);
        }
        if (typeof pos.cash_rounding === 'boolean') setCashRounding(pos.cash_rounding);
        if (pos.order_prefix) setOrderPrefix(pos.order_prefix);
        if (typeof pos.order_starting_number === 'number') {
          setOrderStart(String(pos.order_starting_number));
        }

        // Receipt
        const receipt = (s.receipt ?? {}) as Partial<ReceiptSettings>;
        if (receipt.header_text != null) setHeaderText(receipt.header_text);
        if (receipt.footer_text != null) setFooterText(receipt.footer_text);
        if (receipt.instagram != null) setInstagram(receipt.instagram);
        if (receipt.facebook != null) setFacebook(receipt.facebook);
      })
      .catch(() => {
        toast.error('Failed to load POS settings.');
      })
      .finally(() => setLoading(false));
  }, []);

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch('/organizations/me/settings', {
        pos: {
          default_order_type: orderType,
          tipping_enabled: tippingEnabled,
          tip_percentages: tips.map((t) => parseInt(t, 10) || 0),
          cash_rounding: cashRounding,
          order_prefix: orderPrefix,
          order_starting_number: parseInt(orderStart, 10) || 1,
        },
        receipt: {
          header_text: headerText,
          footer_text: footerText,
          instagram: instagram || undefined,
          facebook: facebook || undefined,
        },
      });
      toast.success('POS settings saved.');
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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Receipt template */}
      <Card>
        <CardHeader>
          <CardTitle>Receipt Template</CardTitle>
          <CardDescription>Customise what appears on printed receipts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="pos-header" className="text-sm font-medium">
                  Header text
                </label>
                <Textarea
                  id="pos-header"
                  placeholder="Displayed at the top of receipts"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  disabled={saving}
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="pos-footer" className="text-sm font-medium">
                  Footer text
                </label>
                <Textarea
                  id="pos-footer"
                  placeholder="Thank you for visiting!"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  disabled={saving}
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="pos-ig" className="text-sm font-medium">
                  Instagram
                </label>
                <Input
                  id="pos-ig"
                  placeholder="@mycafe"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="pos-fb" className="text-sm font-medium">
                  Facebook
                </label>
                <Input
                  id="pos-fb"
                  placeholder="facebook.com/mycafe"
                  value={facebook}
                  onChange={(e) => setFacebook(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            {/* Live preview */}
            <div className="space-y-1">
              <p className="text-sm font-medium">Preview</p>
              <div className="rounded-lg border bg-white p-4 text-center font-mono text-xs text-black">
                <div className="flex justify-center pb-2">
                  <Receipt className="h-5 w-5 text-muted-foreground" />
                </div>
                {headerText ? (
                  <p className="whitespace-pre-wrap">{headerText}</p>
                ) : (
                  <p className="font-bold">{orgName || 'Your Business'}</p>
                )}
                <div className="my-3 border-t border-dashed" />
                <p className="text-[10px] text-gray-400">Order items appear here</p>
                <div className="my-3 border-t border-dashed" />
                {footerText && <p className="whitespace-pre-wrap">{footerText}</p>}
                {(instagram || facebook) && (
                  <div className="mt-2 text-[10px] text-gray-500">
                    {instagram && <p>{instagram}</p>}
                    {facebook && <p>{facebook}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Default order type */}
      <Card>
        <CardHeader>
          <CardTitle>Default Order Type</CardTitle>
          <CardDescription>Pre-selected when creating a new order.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <label
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                orderType === 'dine_in'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-input text-muted-foreground hover:border-muted-foreground/50'
              }`}
            >
              <input
                type="radio"
                name="orderType"
                value="dine_in"
                checked={orderType === 'dine_in'}
                onChange={() => setOrderType('dine_in')}
                disabled={saving}
                className="sr-only"
              />
              Dine-in
            </label>
            <label
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                orderType === 'takeaway'
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-input text-muted-foreground hover:border-muted-foreground/50'
              }`}
            >
              <input
                type="radio"
                name="orderType"
                value="takeaway"
                checked={orderType === 'takeaway'}
                onChange={() => setOrderType('takeaway')}
                disabled={saving}
                className="sr-only"
              />
              Takeaway
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Tipping */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Tipping</CardTitle>
              <CardDescription>Show tip options on the payment screen.</CardDescription>
            </div>
            <Switch
              checked={tippingEnabled}
              onCheckedChange={setTippingEnabled}
              disabled={saving}
            />
          </div>
        </CardHeader>
        {tippingEnabled && (
          <CardContent>
            <div className="space-y-1">
              <label className="text-sm font-medium">Tip percentages</label>
              <div className="flex gap-3">
                {tips.map((val, i) => (
                  <div key={i} className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={val}
                      onChange={(e) => {
                        const next = [...tips] as [string, string, string];
                        next[i] = e.target.value;
                        setTips(next);
                      }}
                      disabled={saving}
                      className="w-20 pr-7"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Customers will see these options when paying.
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Cash rounding */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Cash Rounding</CardTitle>
              <CardDescription>
                Cash payments rounded to the nearest 5 cents per Australian standard.
              </CardDescription>
            </div>
            <Switch checked={cashRounding} onCheckedChange={setCashRounding} disabled={saving} />
          </div>
        </CardHeader>
      </Card>

      {/* Order numbering */}
      <Card>
        <CardHeader>
          <CardTitle>Order Numbering</CardTitle>
          <CardDescription>Configure how order numbers are generated.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="pos-prefix" className="text-sm font-medium">
                Prefix
              </label>
              <Input
                id="pos-prefix"
                placeholder="ORD-"
                value={orderPrefix}
                onChange={(e) => setOrderPrefix(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                e.g. &quot;{orderPrefix || 'ORD-'}001&quot;
              </p>
            </div>
            <div className="space-y-1">
              <label htmlFor="pos-start" className="text-sm font-medium">
                Starting number
              </label>
              <Input
                id="pos-start"
                type="number"
                min="1"
                value={orderStart}
                onChange={(e) => setOrderStart(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
