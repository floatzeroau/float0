'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { LogOut, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiClientError } from '@/lib/api';
import { useOrg } from '@/lib/org-context';
import { useAuth } from '@/lib/auth-context';

export default function AccountPage() {
  const org = useOrg();
  const { customer, isAuthenticated, isLoading: authLoading, logout, refreshProfile } = useAuth();
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace(`/${org.slug}/login`);
    }
  }, [isAuthenticated, authLoading, org.slug, router]);

  useEffect(() => {
    if (customer) {
      setFirstName(customer.firstName);
      setLastName(customer.lastName);
      setPhone(customer.phone ?? '');
    }
  }, [customer]);

  function handleStartEdit() {
    setEditing(true);
  }

  function handleCancel() {
    if (customer) {
      setFirstName(customer.firstName);
      setLastName(customer.lastName);
      setPhone(customer.phone ?? '');
    }
    setEditing(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.put(`/portal/${org.slug}/me`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
      });
      await refreshProfile(org.slug);
      setEditing(false);
      toast.success('Profile updated.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to update profile.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    logout();
    router.replace(`/${org.slug}`);
  }

  if (authLoading || !customer) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const initials = `${customer.firstName[0]}${customer.lastName[0]}`.toUpperCase();

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold">Account</h1>

      {/* Profile card */}
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {initials}
            </span>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                      disabled={saving}
                    />
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                      disabled={saving}
                    />
                  </div>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    type="tel"
                    disabled={saving}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      <Check className="mr-1 h-3.5 w-3.5" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleCancel} disabled={saving}>
                      <X className="mr-1 h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-semibold">
                    {customer.firstName} {customer.lastName}
                  </h2>
                  <p className="text-sm text-muted-foreground">{customer.email}</p>
                  {customer.phone && (
                    <p className="text-sm text-muted-foreground">{customer.phone}</p>
                  )}
                </>
              )}
            </div>
            {!editing && (
              <Button size="icon" variant="ghost" onClick={handleStartEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <Card className="mt-3">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Member since</p>
              <p className="font-medium">{new Date(customer.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Loyalty balance</p>
              <p className="font-medium">{customer.loyaltyBalance} pts</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button variant="outline" className="mt-6 w-full" onClick={handleLogout}>
        <LogOut className="mr-2 h-4 w-4" />
        Log Out
      </Button>
    </div>
  );
}
