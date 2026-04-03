'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api, ApiClientError, setTokens } from '@/lib/api';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

interface OrgResponse {
  settings: Record<string, unknown>;
  [key: string]: unknown;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { accessToken, refreshToken } = await api.post<LoginResponse>('/auth/login', {
        email,
        password,
      });

      setTokens(accessToken, refreshToken);

      // Fetch org to decide where to redirect
      try {
        const org = await api.get<OrgResponse>('/organizations/me');
        const onboardingStatus = org.settings?.onboarding_status;

        if (onboardingStatus && onboardingStatus !== 'completed') {
          router.push('/onboarding');
        } else {
          router.push('/');
        }
      } catch {
        // If org fetch fails, go to dashboard anyway
        router.push('/');
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        const message = body?.error ?? 'Invalid email or password';

        if (err.status === 429) {
          toast.error('Account locked. Please try again later.');
        } else {
          toast.error(message);
        }
      } else {
        toast.error('Network error. Please check your connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Sign in to Float0</CardTitle>
        <CardDescription>Enter your credentials to access the dashboard</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <div className="mt-4 space-y-2 text-center text-sm">
          <div>
            <Link href="/forgot-password" className="text-primary hover:underline">
              Forgot your password?
            </Link>
          </div>
          <div>
            <span className="text-muted-foreground">Don&apos;t have an account? </span>
            <Link href="/register" className="text-primary hover:underline">
              Create an account
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
