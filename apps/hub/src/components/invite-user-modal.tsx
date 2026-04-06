'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, ApiClientError } from '@/lib/api';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';

interface InviteUserModalProps {
  onInvited?: () => void;
}

type CreateMode = 'invite' | 'direct';

export function InviteUserModal({ onInvited }: InviteUserModalProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<CreateMode>('direct');
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<string>('staff');
  const [pin, setPin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function resetForm() {
    setEmail('');
    setFirstName('');
    setLastName('');
    setPassword('');
    setRole('staff');
    setPin('');
    setErrors({});
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email';
    if (!firstName.trim()) errs.firstName = 'First name is required';
    if (!lastName.trim()) errs.lastName = 'Last name is required';
    if (mode === 'direct') {
      if (!password) errs.password = 'Password is required';
      else if (password.length < 8) errs.password = 'Must be at least 8 characters';
      else if (!/[a-zA-Z]/.test(password)) errs.password = 'Must contain a letter';
      else if (!/[0-9]/.test(password)) errs.password = 'Must contain a number';
    }
    if (pin && !/^\d{4,6}$/.test(pin)) errs.pin = 'PIN must be 4-6 digits';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, string> = {
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
      };
      if (pin) payload.posPin = pin;
      if (mode === 'direct') payload.password = password;

      await api.post('/users/invite', payload);

      if (mode === 'direct') {
        toast.success(`${firstName.trim()} ${lastName.trim()} created successfully`);
      } else {
        toast.success(`Invitation sent to ${email.trim()}`);
      }
      resetForm();
      setOpen(false);
      onInvited?.();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string; details?: Record<string, string[]> } | null;
        if (body?.details) {
          const fieldErrors: Record<string, string> = {};
          for (const [key, msgs] of Object.entries(body.details)) {
            fieldErrors[key] = msgs[0];
          }
          setErrors(fieldErrors);
        } else {
          toast.error(body?.error ?? 'Failed to create staff member');
        }
      } else {
        toast.error('Failed to create staff member');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Staff
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Create a new staff member or send an email invitation.
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex rounded-lg border p-1">
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'direct'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('direct')}
          >
            Create directly
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'invite'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('invite')}
          >
            Invite by email
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="invite-first" className="text-sm font-medium">
                First Name
              </label>
              <Input
                id="invite-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
              />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName}</p>}
            </div>
            <div className="space-y-2">
              <label htmlFor="invite-last" className="text-sm font-medium">
                Last Name
              </label>
              <Input
                id="invite-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
              />
              {errors.lastName && <p className="text-xs text-destructive">{errors.lastName}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="invite-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          {/* Password — only in direct mode */}
          {mode === 'direct' && (
            <div className="space-y-2">
              <label htmlFor="invite-password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="invite-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 chars, letter + number"
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label htmlFor="invite-pin" className="text-sm font-medium">
                POS PIN <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="invite-pin"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="1234"
              />
              {errors.pin && <p className="text-xs text-destructive">{errors.pin}</p>}
            </div>
          </div>

          {mode === 'invite' && (
            <p className="text-xs text-muted-foreground">
              An email will be sent with a setup link. The staff member will set their own password.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? 'Saving...'
                : mode === 'direct'
                  ? 'Create Staff Member'
                  : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
