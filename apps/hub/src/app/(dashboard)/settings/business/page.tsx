'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Upload, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api, ApiClientError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgData {
  id: string;
  name: string;
  abn?: string;
  address?: string | { street?: string; suburb?: string; state?: string; postcode?: string };
  phone?: string;
  email?: string;
  website?: string;
  logo?: string;
  timezone?: string;
  settings?: Record<string, unknown>;
}

interface DayHours {
  isOpen: boolean;
  open: string;
  close: string;
}

type OperatingHours = Record<string, DayHours>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const;

const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const DAY_LABELS: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

function defaultHours(): OperatingHours {
  const hours: OperatingHours = {};
  for (const day of DAYS) {
    hours[day] = {
      isOpen: day !== 'sunday',
      open: '07:00',
      close: '17:00',
    };
  }
  return hours;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BusinessProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [abn, setAbn] = useState('');
  const [street, setStreet] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('VIC');
  const [postcode, setPostcode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [hours, setHours] = useState<OperatingHours>(defaultHours);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // -------------------------------------------------------------------------
  // Fetch org data
  // -------------------------------------------------------------------------

  useEffect(() => {
    api
      .get<OrgData>('/organizations/me')
      .then((org) => {
        setName(org.name ?? '');
        setAbn(org.abn ?? '');
        setPhone(org.phone ?? '');
        setEmail(org.email ?? '');
        setWebsite(org.website ?? '');
        if (org.logo) setLogoPreview(org.logo);

        // Parse address — supports both object and legacy string format
        if (org.address) {
          if (typeof org.address === 'object') {
            const addr = org.address as {
              street?: string;
              suburb?: string;
              state?: string;
              postcode?: string;
            };
            if (addr.street) setStreet(addr.street);
            if (addr.suburb) setSuburb(addr.suburb);
            if (addr.state) setState(addr.state);
            if (addr.postcode) setPostcode(addr.postcode);
          } else if (typeof org.address === 'string') {
            const parts = org.address.split(',').map((s) => s.trim());
            if (parts[0]) setStreet(parts[0]);
            if (parts[1]) setSuburb(parts[1]);
            if (parts[2]) {
              const match = parts[2].match(/^([A-Z]{2,3})\s*(\d{4})$/);
              if (match) {
                setState(match[1]);
                setPostcode(match[2]);
              }
            }
          }
        }

        // Operating hours from settings
        const savedHours = org.settings?.operating_hours as OperatingHours | undefined;
        if (savedHours) {
          setHours((prev) => ({ ...prev, ...savedHours }));
        }
      })
      .catch(() => {
        toast.error('Failed to load business profile.');
      })
      .finally(() => setLoading(false));
  }, []);

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  function validateAbn(value: string): string {
    const digits = value.replace(/\s/g, '');
    if (digits && !/^\d{11}$/.test(digits)) {
      return 'ABN must be exactly 11 digits';
    }
    return '';
  }

  function handleAbnBlur() {
    const err = validateAbn(abn);
    setErrors((prev) => {
      if (err) return { ...prev, abn: err };
      const { abn: _, ...rest } = prev;
      return rest;
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Business name is required';
    const abnErr = validateAbn(abn);
    if (abnErr) next.abn = abnErr;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = 'Enter a valid email address';
    }
    if (postcode && !/^\d{4}$/.test(postcode)) {
      next.postcode = 'Postcode must be 4 digits';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // -------------------------------------------------------------------------
  // Logo
  // -------------------------------------------------------------------------

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2 MB.');
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function removeLogo() {
    setLogoFile(null);
    setLogoPreview(null);
  }

  // -------------------------------------------------------------------------
  // Operating hours
  // -------------------------------------------------------------------------

  function updateHours(day: string, field: keyof DayHours, value: string | boolean) {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  async function handleSave() {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        abn: abn.replace(/\s/g, '') || undefined,
        address: {
          street: street.trim() || undefined,
          suburb: suburb.trim() || undefined,
          state: state || undefined,
          postcode: postcode.trim() || undefined,
        },
        phone: phone || undefined,
        email: email || undefined,
        website: website || undefined,
      };

      // Logo as base64 if new file selected
      if (logoFile) {
        payload.logo = logoPreview;
      } else if (!logoPreview) {
        payload.logo = null;
      }

      await api.put('/organizations/me', payload);

      toast.success('Business profile saved.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to save business profile.');
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
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Business details */}
      <Card>
        <CardHeader>
          <CardTitle>Business Details</CardTitle>
          <CardDescription>Your business name and registration details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="bp-name" className="text-sm font-medium">
              Business name <span className="text-destructive">*</span>
            </label>
            <Input
              id="bp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="bp-abn" className="text-sm font-medium">
              ABN
            </label>
            <Input
              id="bp-abn"
              placeholder="XX XXX XXX XXX"
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              onBlur={handleAbnBlur}
              disabled={saving}
              maxLength={14}
              aria-invalid={!!errors.abn}
            />
            {errors.abn ? (
              <p className="text-xs text-destructive">{errors.abn}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Australian Business Number (11 digits)
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contact & Address */}
      <Card>
        <CardHeader>
          <CardTitle>Contact &amp; Address</CardTitle>
          <CardDescription>How customers and suppliers can reach you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Address</legend>
            <Input
              placeholder="Street address"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              disabled={saving}
            />
            <div className="grid grid-cols-3 gap-3">
              <Input
                placeholder="Suburb"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                disabled={saving}
              />
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                disabled={saving}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {AU_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <div className="space-y-1">
                <Input
                  placeholder="Postcode"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  disabled={saving}
                  maxLength={4}
                  aria-invalid={!!errors.postcode}
                />
                {errors.postcode && <p className="text-xs text-destructive">{errors.postcode}</p>}
              </div>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="bp-phone" className="text-sm font-medium">
                Phone
              </label>
              <Input
                id="bp-phone"
                type="tel"
                placeholder="+61 400 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="bp-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="bp-email"
                type="email"
                placeholder="info@mybusiness.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="bp-website" className="text-sm font-medium">
              Website
            </label>
            <Input
              id="bp-website"
              type="url"
              placeholder="https://mybusiness.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={saving}
            />
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>Displayed on receipts and the POS screen.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            {logoPreview ? (
              <div className="relative">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="h-20 w-20 rounded-lg border object-cover"
                />
                <button
                  type="button"
                  onClick={removeLogo}
                  disabled={saving}
                  className="absolute -right-2 -top-2 rounded-full bg-destructive p-0.5 text-destructive-foreground hover:bg-destructive/90"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                <Upload className="h-6 w-6" />
              </div>
            )}
            <div className="space-y-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors">
                <Upload className="h-4 w-4" />
                Choose file
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  disabled={saving}
                  className="sr-only"
                />
              </label>
              <p className="text-xs text-muted-foreground">PNG, JPG or SVG. Max 2 MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Operating Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Operating Hours</CardTitle>
          <CardDescription>When your business is open.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {DAYS.map((day) => {
              const dayHours = hours[day];
              return (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-10 text-sm font-medium">{DAY_LABELS[day]}</span>
                  <Switch
                    checked={dayHours.isOpen}
                    onCheckedChange={(val) => updateHours(day, 'isOpen', val)}
                    disabled={saving}
                    aria-label={`${DAY_LABELS[day]} open`}
                  />
                  {dayHours.isOpen ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={dayHours.open}
                        onChange={(e) => updateHours(day, 'open', e.target.value)}
                        disabled={saving}
                        className="w-28"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={dayHours.close}
                        onChange={(e) => updateHours(day, 'close', e.target.value)}
                        disabled={saving}
                        className="w-28"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Closed</span>
                  )}
                </div>
              );
            })}
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
