'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOrg } from '@/lib/org-context';
import { useAuth } from '@/lib/auth-context';
import { ApiClientError } from '@/lib/api';

export default function LoginPage() {
  const org = useOrg();
  const { login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!email.trim()) next.email = 'Email is required';
    if (!password) next.password = 'Password is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      await login(org.slug, email.trim(), password);
      router.replace(`/${org.slug}/my-packs`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string; code?: string } | null;
        if (body?.code === 'SETUP_REQUIRED') {
          toast.error('Please set up your password. Contact the cafe for assistance.');
        } else {
          toast.error(body?.error ?? 'Invalid email or password.');
        }
      } else {
        toast.error('Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fade-in flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full">
        <CardHeader className="space-y-1.5 text-center">
          <CardTitle className="text-display font-bold">Welcome back</CardTitle>
          <CardDescription className="text-body">Log in to your {org.name} account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-small font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="text-small text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-small font-medium">
                Password
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                aria-invalid={!!errors.password}
              />
              {errors.password && <p className="text-small text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Logging in…' : 'Log in'}
            </Button>
          </form>

          <p className="mt-5 text-center text-small text-muted-foreground">
            New here?{' '}
            <Link
              href={`/${org.slug}/register`}
              className="font-medium text-primary hover:underline"
            >
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
