'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api, ApiClientError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegisterResponse {
  accessToken: string;
  refreshToken: string;
}

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------

type Strength = 'weak' | 'fair' | 'strong';

function getPasswordStrength(pw: string): Strength {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  if (score <= 2) return 'weak';
  if (score <= 3) return 'fair';
  return 'strong';
}

const strengthConfig: Record<Strength, { label: string; color: string; width: string }> = {
  weak: { label: 'Weak', color: 'bg-destructive', width: 'w-1/3' },
  fair: { label: 'Fair', color: 'bg-yellow-500', width: 'w-2/3' },
  strong: { label: 'Strong', color: 'bg-green-500', width: 'w-full' },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RegisterPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Form fields
  const [orgName, setOrgName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [abn, setAbn] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const strength = password.length > 0 ? getPasswordStrength(password) : null;

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (!orgName.trim()) next.orgName = 'Business name is required';
    if (!firstName.trim()) next.firstName = 'First name is required';
    if (!lastName.trim()) next.lastName = 'Last name is required';
    if (!email.trim()) {
      next.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = 'Enter a valid email address';
    }
    if (password.length < 8) {
      next.password = 'Password must be at least 8 characters';
    } else if (!/[a-zA-Z]/.test(password)) {
      next.password = 'Password must contain at least one letter';
    } else if (!/[0-9]/.test(password)) {
      next.password = 'Password must contain at least one number';
    }
    if (password !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match';
    }
    if (abn && !/^\d{11}$/.test(abn.replace(/\s/g, ''))) {
      next.abn = 'ABN must be exactly 11 digits';
    }
    if (!termsAccepted) {
      next.terms = 'You must accept the terms of service';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const { accessToken, refreshToken } = await api.post<RegisterResponse>('/auth/register', {
        email,
        password,
        firstName,
        lastName,
        phone: phone || undefined,
        orgName,
        abn: abn.replace(/\s/g, '') || undefined,
      });

      localStorage.setItem('auth_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);

      router.push('/onboarding');
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as { error?: string } | null;

        if (err.status === 409) {
          setErrors((prev) => ({
            ...prev,
            email: 'An account with this email already exists',
          }));
        } else {
          toast.error(body?.error ?? 'Registration failed. Please try again.');
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
        <CardTitle className="text-2xl font-bold">Create your account</CardTitle>
        <CardDescription>Set up your business on Float0</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Business name */}
          <div className="space-y-1">
            <label htmlFor="orgName" className="text-sm font-medium">
              Business name <span className="text-destructive">*</span>
            </label>
            <Input
              id="orgName"
              placeholder="My Cafe"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={isSubmitting}
              aria-invalid={!!errors.orgName}
              aria-describedby={errors.orgName ? 'orgName-error' : undefined}
            />
            {errors.orgName && (
              <p id="orgName-error" className="text-xs text-destructive">
                {errors.orgName}
              </p>
            )}
          </div>

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="firstName" className="text-sm font-medium">
                First name <span className="text-destructive">*</span>
              </label>
              <Input
                id="firstName"
                placeholder="Jane"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isSubmitting}
                aria-invalid={!!errors.firstName}
                aria-describedby={errors.firstName ? 'firstName-error' : undefined}
              />
              {errors.firstName && (
                <p id="firstName-error" className="text-xs text-destructive">
                  {errors.firstName}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="lastName" className="text-sm font-medium">
                Last name <span className="text-destructive">*</span>
              </label>
              <Input
                id="lastName"
                placeholder="Doe"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isSubmitting}
                aria-invalid={!!errors.lastName}
                aria-describedby={errors.lastName ? 'lastName-error' : undefined}
              />
              {errors.lastName && (
                <p id="lastName-error" className="text-xs text-destructive">
                  {errors.lastName}
                </p>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email <span className="text-destructive">*</span>
            </label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="text-xs text-destructive">
                {errors.email}
              </p>
            )}
          </div>

          {/* Phone + ABN row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="phone" className="text-sm font-medium">
                Phone
              </label>
              <Input
                id="phone"
                type="tel"
                placeholder="+61 400 000 000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isSubmitting}
                autoComplete="tel"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="abn" className="text-sm font-medium">
                ABN
              </label>
              <Input
                id="abn"
                placeholder="11 digits"
                value={abn}
                onChange={(e) => setAbn(e.target.value)}
                disabled={isSubmitting}
                maxLength={14}
                aria-invalid={!!errors.abn}
                aria-describedby="abn-hint"
              />
              {errors.abn ? (
                <p id="abn-hint" className="text-xs text-destructive">
                  {errors.abn}
                </p>
              ) : (
                <p id="abn-hint" className="text-xs text-muted-foreground">
                  Australian Business Number
                </p>
              )}
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password <span className="text-destructive">*</span>
            </label>
            <Input
              id="password"
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : 'password-strength'}
            />
            {errors.password && (
              <p id="password-error" className="text-xs text-destructive">
                {errors.password}
              </p>
            )}
            {strength && !errors.password && (
              <div id="password-strength" className="space-y-1 pt-1">
                <div className="h-1.5 w-full rounded-full bg-muted">
                  <div
                    className={`h-1.5 rounded-full transition-all ${strengthConfig[strength].color} ${strengthConfig[strength].width}`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{strengthConfig[strength].label}</p>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm password <span className="text-destructive">*</span>
            </label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
            />
            {errors.confirmPassword && (
              <p id="confirmPassword-error" className="text-xs text-destructive">
                {errors.confirmPassword}
              </p>
            )}
          </div>

          {/* Terms */}
          <div className="space-y-1">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                disabled={isSubmitting}
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                aria-invalid={!!errors.terms}
              />
              <span>
                I agree to the{' '}
                <Link href="/terms" className="text-primary hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
              </span>
            </label>
            {errors.terms && <p className="text-xs text-destructive">{errors.terms}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          <span className="text-muted-foreground">Already have an account? </span>
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
