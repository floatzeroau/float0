'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, ApiClientError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvitedMember {
  id: string;
  email: string;
  firstName: string;
  role: string;
  status: 'sent' | 'failed';
}

const ROLES = ['admin', 'manager', 'staff'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface InviteTeamProps {
  onNext: () => void;
  onBack: () => void;
}

export function InviteTeam({ onNext, onBack }: InviteTeamProps) {
  const [members, setMembers] = useState<InvitedMember[]>([]);

  // Form state
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [role, setRole] = useState<string>('staff');
  const [pin, setPin] = useState('');
  const [sending, setSending] = useState(false);

  const canInvite = email.trim().length > 0 && firstName.trim().length > 0;

  async function handleInvite() {
    if (!canInvite) return;

    setSending(true);
    try {
      await api.post('/users/invite', {
        email: email.trim(),
        firstName: firstName.trim(),
        role,
        pin: pin || undefined,
      });

      setMembers((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          email: email.trim(),
          firstName: firstName.trim(),
          role,
          status: 'sent',
        },
      ]);

      toast.success(`Invite sent to ${email.trim()}`);
      setEmail('');
      setFirstName('');
      setPin('');
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;

        setMembers((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            email: email.trim(),
            firstName: firstName.trim(),
            role,
            status: 'failed',
          },
        ]);

        toast.error(body?.error ?? 'Failed to send invite.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite Your Team</CardTitle>
        <CardDescription>Invite staff members so they can use the POS.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Invite form */}
        <div className="space-y-3 rounded-lg border p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="inv-first" className="text-sm font-medium">
                First name <span className="text-destructive">*</span>
              </label>
              <Input
                id="inv-first"
                placeholder="Jane"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={sending}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="inv-email" className="text-sm font-medium">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                id="inv-email"
                type="email"
                placeholder="jane@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={sending}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="inv-role" className="text-sm font-medium">
                Role
              </label>
              <select
                id="inv-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={sending}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm capitalize focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="inv-pin" className="text-sm font-medium">
                POS PIN
              </label>
              <Input
                id="inv-pin"
                type="password"
                placeholder="4-6 digits"
                value={pin}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPin(v);
                }}
                disabled={sending}
                maxLength={6}
                inputMode="numeric"
              />
              <p className="text-xs text-muted-foreground">Optional. 4-6 digits for POS login.</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleInvite}
            disabled={!canInvite || sending}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {sending ? 'Sending...' : 'Send invite'}
          </Button>
        </div>

        {/* Invited list */}
        {members.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.firstName}</TableCell>
                    <TableCell>{m.email}</TableCell>
                    <TableCell className="capitalize">{m.role}</TableCell>
                    <TableCell>
                      <Badge variant={m.status === 'sent' ? 'default' : 'destructive'}>
                        {m.status === 'sent' ? 'Invited' : 'Failed'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {members.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
            <UserPlus className="h-8 w-8" />
            <p className="text-sm">
              No invites sent yet. You can always invite team members later.
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onNext}>
              Skip this step
            </Button>
            <Button type="button" onClick={onNext} disabled={members.length === 0}>
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
