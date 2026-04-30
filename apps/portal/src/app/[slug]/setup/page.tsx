'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOrg } from '@/lib/org-context';
import { useAuth } from '@/lib/auth-context';
import { ApiClientError } from '@/lib/api';

function SetupForm() {
  const org = useOrg();
  const { completeSetup } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!token) {
    return (
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Setup link missing</CardTitle>
          <CardDescription>
            This page requires a setup token. Please use the link {org.name} sent you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/${org.slug}/login`}
            className="block text-center text-sm font-medium text-primary hover:underline"
          >
            Back to login
          </Link>
        </CardContent>
      </Card>
    );
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (password.length < 8) {
      next.password = 'Password must be at least 8 characters';
    } else if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      next.password = 'Password must include a letter and a number';
    }
    if (confirm !== password) {
      next.confirm = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!token) return;

    setLoading(true);
    try {
      await completeSetup(org.slug, token, password);
      toast.success('Welcome aboard!');
      router.replace(`/${org.slug}/my-packs`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        if (err.status === 401) {
          toast.error('This setup link has expired. Ask the cafe for a new one.');
        } else {
          toast.error(body?.error ?? 'Could not set up your account.');
        }
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Set your password</CardTitle>
        <CardDescription>
          Create a password to access your {org.name} customer portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              aria-invalid={!!errors.password}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">{errors.password}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters and include a letter and a number.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="confirm" className="text-sm font-medium">
              Confirm password
            </label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={loading}
              aria-invalid={!!errors.confirm}
            />
            {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Setting up...' : 'Continue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SetupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <Suspense
        fallback={
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        }
      >
        <SetupForm />
      </Suspense>
    </div>
  );
}
