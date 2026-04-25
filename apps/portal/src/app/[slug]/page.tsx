'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useOrg } from '@/lib/org-context';
import { useAuth } from '@/lib/auth-context';

export default function LandingPage() {
  const org = useOrg();
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(`/${org.slug}/my-packs`);
    }
  }, [isLoading, isAuthenticated, org.slug, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const hours = org.operatingHours as Record<string, string> | null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      {/* Logo / Icon */}
      <div className="mb-6">
        {org.logo ? (
          <img src={org.logo} alt={org.name} className="h-24 w-24 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-primary/10">
            <Coffee className="h-12 w-12 text-primary" />
          </div>
        )}
      </div>

      {/* Org name */}
      <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
      <p className="mt-2 text-center text-muted-foreground">Welcome to our customer portal</p>

      {/* Operating hours */}
      {hours && Object.keys(hours).length > 0 && (
        <Card className="mt-6 w-full">
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Operating Hours</h3>
            <div className="space-y-1">
              {Object.entries(hours).map(([day, time]) => (
                <div key={day} className="flex justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{day}</span>
                  <span>{time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* CTA Buttons */}
      <div className="mt-8 flex w-full flex-col gap-3">
        <Button asChild size="lg" className="w-full">
          <Link href={`/${org.slug}/register`}>Sign Up</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href={`/${org.slug}/login`}>Log In</Link>
        </Button>
      </div>

      {/* Browse links */}
      <div className="mt-6 flex gap-4 text-sm">
        <Link href={`/${org.slug}/menu`} className="text-primary hover:underline">
          Browse Menu
        </Link>
        <Link href={`/${org.slug}/packs`} className="text-primary hover:underline">
          View Packs
        </Link>
      </div>
    </div>
  );
}
