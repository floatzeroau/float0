'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Check } from 'lucide-react';
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

interface EnablePortalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customer: {
    firstName: string;
    lastName: string;
    email?: string | null;
  } | null;
  onEnabled: () => void;
}

export function EnablePortalDialog({
  open,
  onOpenChange,
  customerId,
  customer,
  onEnabled,
}: EnablePortalDialogProps) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [setupUrl, setSetupUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(customer?.email ?? '');
      setErrors({});
      setSetupUrl(null);
      setCopied(false);
    }
  }, [open, customer]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!email.trim()) {
      next.email = 'Email is required to enable portal access';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email address';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    setSaving(true);
    try {
      const result = await api.post<{ setupUrl: string; email: string }>(
        `/customers/${customerId}/enable-portal`,
        { email: email.trim() },
      );
      setSetupUrl(result.setupUrl);
      toast.success('Portal access enabled.');
      onEnabled();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to enable portal access.');
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    if (!setupUrl) return;
    try {
      await navigator.clipboard.writeText(setupUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enable Portal Access</DialogTitle>
          <DialogDescription>
            {setupUrl
              ? 'Share this link with the customer to set their password. The link expires in 72 hours.'
              : `Generate a setup link so ${
                  customer ? `${customer.firstName} ${customer.lastName}` : 'this customer'
                } can sign in to the customer portal.`}
          </DialogDescription>
        </DialogHeader>

        {!setupUrl ? (
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label htmlFor="ep-email" className="text-sm font-medium">
                Email <span className="text-destructive">*</span>
              </label>
              <Input
                id="ep-email"
                type="email"
                placeholder="customer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              <p className="text-xs text-muted-foreground">
                The customer will use this email to sign in.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2">
              <Input value={setupUrl} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={handleCopy} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The setup link expires in 72 hours. After that, generate a new one.
            </p>
          </div>
        )}

        <DialogFooter>
          {!setupUrl ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? 'Generating...' : 'Generate Setup Link'}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
