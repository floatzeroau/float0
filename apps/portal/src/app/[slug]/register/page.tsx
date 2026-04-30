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

export default function RegisterPage() {
  const org = useOrg();
  const { register } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'First name is required';
    if (!lastName.trim()) next.lastName = 'Last name is required';
    if (!email.trim()) next.email = 'Email is required';
    if (!password) next.password = 'Password is required';
    else if (password.length < 8) next.password = 'At least 8 characters';
    else if (!/[a-zA-Z]/.test(password)) next.password = 'Must contain a letter';
    else if (!/[0-9]/.test(password)) next.password = 'Must contain a number';
    if (password && confirmPassword !== password) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      await register(org.slug, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      toast.success('Account created!');
      router.replace(`/${org.slug}/my-packs`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;
        toast.error(body?.error ?? 'Failed to create account.');
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
          <CardTitle className="text-display font-bold">Join {org.name}</CardTitle>
          <CardDescription className="text-body">
            Track packs, orders, and rewards in one place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="firstName" className="text-small font-medium">
                  First name
                </label>
                <Input
                  id="firstName"
                  autoComplete="given-name"
                  placeholder="Jamie"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={loading}
                  aria-invalid={!!errors.firstName}
                />
                {errors.firstName && (
                  <p className="text-small text-destructive">{errors.firstName}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="lastName" className="text-small font-medium">
                  Last name
                </label>
                <Input
                  id="lastName"
                  autoComplete="family-name"
                  placeholder="Lee"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={loading}
                  aria-invalid={!!errors.lastName}
                />
                {errors.lastName && (
                  <p className="text-small text-destructive">{errors.lastName}</p>
                )}
              </div>
            </div>

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
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                aria-invalid={!!errors.password}
              />
              {errors.password ? (
                <p className="text-small text-destructive">{errors.password}</p>
              ) : (
                <p className="text-small text-muted-foreground">
                  At least 8 characters with a letter and a number.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-small font-medium">
                Confirm password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                aria-invalid={!!errors.confirmPassword}
              />
              {errors.confirmPassword && (
                <p className="text-small text-destructive">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-small font-medium">
                Phone <span className="text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="0400 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <p className="mt-5 text-center text-small text-muted-foreground">
            Already have one?{' '}
            <Link href={`/${org.slug}/login`} className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
