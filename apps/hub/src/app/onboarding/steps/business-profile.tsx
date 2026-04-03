'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';
import type { OrgData } from '../page';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const;

const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Australia/Hobart',
  'Australia/Darwin',
  'Australia/Lord_Howe',
] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BusinessProfileProps {
  org: OrgData | null;
  onNext: () => void;
  onOrgUpdate: (data: Partial<OrgData>) => void;
}

export function BusinessProfile({ org, onNext, onOrgUpdate }: BusinessProfileProps) {
  const [saving, setSaving] = useState(false);

  // Form state — pre-fill from org data
  const [name, setName] = useState(org?.name ?? '');
  const [abn, setAbn] = useState(org?.abn ?? '');
  const [street, setStreet] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('VIC');
  const [postcode, setPostcode] = useState('');
  const [phone, setPhone] = useState(org?.phone ?? '');
  const [email, setEmail] = useState(org?.email ?? '');
  const [website, setWebsite] = useState(org?.website ?? '');
  const [timezone, setTimezone] = useState(org?.timezone ?? 'Australia/Melbourne');

  const canSubmit = name.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    try {
      const payload = {
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
        timezone,
      };

      await api.put('/organizations/me', payload);
      onOrgUpdate(payload);
      onNext();
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Profile</CardTitle>
        <CardDescription>Tell us about your business so we can set things up.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Business name */}
          <div className="space-y-1">
            <label htmlFor="bp-name" className="text-sm font-medium">
              Business name <span className="text-destructive">*</span>
            </label>
            <Input
              id="bp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          {/* ABN */}
          <div className="space-y-1">
            <label htmlFor="bp-abn" className="text-sm font-medium">
              ABN
            </label>
            <Input
              id="bp-abn"
              placeholder="11 digits"
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              disabled={saving}
              maxLength={14}
            />
          </div>

          {/* Address */}
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
                className="col-span-1"
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
              <Input
                placeholder="Postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                disabled={saving}
                maxLength={4}
              />
            </div>
          </fieldset>

          {/* Phone & Email */}
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
              />
            </div>
          </div>

          {/* Website */}
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

          {/* Timezone */}
          <div className="space-y-1">
            <label htmlFor="bp-tz" className="text-sm font-medium">
              Timezone
            </label>
            <select
              id="bp-tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={saving}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace('Australia/', '').replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit || saving}>
            {saving ? 'Saving...' : 'Next'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
