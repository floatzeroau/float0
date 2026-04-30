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
    <div className="fade-in flex min-h-screen flex-col items-center px-6 pb-12 pt-16">
      <div className="mb-5">
        {org.logo ? (
          <img src={org.logo} alt={org.name} className="h-24 w-24 rounded-2xl object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-secondary">
            <Coffee className="h-12 w-12 text-primary" />
          </div>
        )}
      </div>

      <h1 className="text-display font-bold tracking-tight">{org.name}</h1>
      <p className="mt-2 text-center text-body text-muted-foreground">
        Order, track packs, and skip the queue.
      </p>

      {hours && Object.keys(hours).length > 0 && (
        <Card className="mt-8 w-full">
          <CardContent className="p-5">
            <h3 className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">
              Hours
            </h3>
            <div className="mt-3 space-y-2">
              {Object.entries(hours).map(([day, time]) => (
                <div key={day} className="flex justify-between text-small">
                  <span className="capitalize text-muted-foreground">{day}</span>
                  <span className="font-medium">{time}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-8 flex w-full flex-col gap-3">
        <Button asChild size="lg" className="w-full">
          <Link href={`/${org.slug}/register`}>Create account</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href={`/${org.slug}/login`}>I already have one</Link>
        </Button>
      </div>

      <Link
        href={`/${org.slug}/menu`}
        className="mt-6 text-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Just looking? Browse the menu
      </Link>
    </div>
  );
}
