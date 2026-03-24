'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StaffMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  hasPinSet: boolean;
}

interface EditStaffModalProps {
  member: StaffMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditStaffModal({ member, open, onOpenChange, onUpdated }: EditStaffModalProps) {
  const [role, setRole] = useState(member?.role ?? 'staff');
  const [newPin, setNewPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  // Sync role when member changes
  if (member && role !== member.role && !saving) {
    setRole(member.role);
  }

  function resetState() {
    setNewPin('');
    setConfirmDeactivate(false);
  }

  async function handleSave() {
    if (!member) return;

    const body: Record<string, string> = {};
    if (role !== member.role) body.role = role;
    if (newPin) body.pin = newPin;

    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      return;
    }

    if (newPin && !/^\d{4,6}$/.test(newPin)) {
      toast.error('PIN must be 4-6 digits');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/users/${member.id}`, body);
      toast.success('Staff member updated');
      resetState();
      onOpenChange(false);
      onUpdated();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to update');
      } else {
        toast.error('Failed to update');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!member) return;
    setDeactivating(true);
    try {
      await api.delete(`/users/${member.id}`);
      toast.success(`${member.firstName} ${member.lastName} has been deactivated`);
      resetState();
      onOpenChange(false);
      onUpdated();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to deactivate');
      } else {
        toast.error('Failed to deactivate');
      }
    } finally {
      setDeactivating(false);
    }
  }

  if (!member) return null;

  const isOwner = member.role === 'owner';

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetState();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Staff Member</DialogTitle>
          <DialogDescription>
            {member.firstName} {member.lastName} &middot; {member.email}
          </DialogDescription>
        </DialogHeader>

        {confirmDeactivate ? (
          <div className="space-y-4">
            <p className="text-sm">
              Are you sure you want to deactivate{' '}
              <strong>
                {member.firstName} {member.lastName}
              </strong>
              ? They will no longer be able to log in or use the POS.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDeactivate(false)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={deactivating} onClick={handleDeactivate}>
                {deactivating ? 'Deactivating...' : 'Confirm Deactivate'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={role} onValueChange={setRole} disabled={isOwner}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
              {isOwner && (
                <p className="text-xs text-muted-foreground">Owner role cannot be changed</p>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor="edit-pin" className="text-sm font-medium">
                {member.hasPinSet ? 'Reset POS PIN' : 'Set POS PIN'}
              </label>
              <Input
                id="edit-pin"
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder={member.hasPinSet ? 'Enter new PIN' : '4-6 digit PIN'}
              />
              <p className="text-xs text-muted-foreground">
                {member.hasPinSet
                  ? 'Leave blank to keep current PIN'
                  : 'Optional: set a PIN for POS login'}
              </p>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
              <div>
                {!isOwner && member.isActive && (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmDeactivate(true)}
                  >
                    Deactivate Account
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button disabled={saving || isOwner} onClick={handleSave}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
