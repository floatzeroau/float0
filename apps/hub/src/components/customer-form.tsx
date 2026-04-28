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
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  totalSpent: number;
  visitCount: number;
  lastVisit?: string | null;
  activePackCount?: number;
  hasPortalAccess?: boolean;
  status: string;
  createdAt: string;
}

interface CustomerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onSaved: () => void;
}

export function CustomerForm({ open, onOpenChange, customer, onSaved }: CustomerFormProps) {
  const isEdit = customer !== null;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (customer) {
      setFirstName(customer.firstName);
      setLastName(customer.lastName);
      setEmail(customer.email ?? '');
      setPhone(customer.phone ?? '');
    } else {
      setFirstName('');
      setLastName('');
      setEmail('');
      setPhone('');
    }
    setErrors({});
  }, [open, customer]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'First name is required';
    if (!lastName.trim()) next.lastName = 'Last name is required';
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
      };

      if (isEdit) {
        await api.put(`/customers/${customer.id}`, payload);
        toast.success('Customer updated.');
      } else {
        await api.post('/customers', payload);
        toast.success('Customer created.');
      }

      onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? `Failed to ${isEdit ? 'update' : 'create'} customer.`);
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
          <DialogTitle>{isEdit ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Update customer details.' : 'Add a new customer to your database.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="cf-first" className="text-sm font-medium">
                First Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="cf-first"
                placeholder="John"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={saving}
                aria-invalid={!!errors.firstName}
              />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
            </div>
            <div className="space-y-1">
              <label htmlFor="cf-last" className="text-sm font-medium">
                Last Name <span className="text-destructive">*</span>
              </label>
              <Input
                id="cf-last"
                placeholder="Smith"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={saving}
                aria-invalid={!!errors.lastName}
              />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="cf-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="cf-email"
              type="email"
              placeholder="john@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
              aria-invalid={!!errors.email}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="cf-phone" className="text-sm font-medium">
              Phone
            </label>
            <Input
              id="cf-phone"
              type="tel"
              placeholder="0400 000 000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Customer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
