'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useParams, usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { setCurrentSlug } from '@/lib/api';
import { CustomerAuthProvider, useAuth } from '@/lib/auth-context';
import { BottomNav } from '@/components/bottom-nav';

// ---------------------------------------------------------------------------
// Org context
// ---------------------------------------------------------------------------

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  operatingHours?: unknown;
  socialMedia?: unknown;
}

const OrgContext = createContext<OrgInfo | null>(null);

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within [slug] layout');
  return ctx;
}

// ---------------------------------------------------------------------------
// Auth-aware shell: shows bottom nav only when authenticated
// ---------------------------------------------------------------------------

function PortalShell({ children, slug }: { children: React.ReactNode; slug: string }) {
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
  const authPages = [`/${slug}/login`, `/${slug}/register`];
  const isAuthPage = authPages.includes(pathname);
  const isLanding = pathname === `/${slug}`;
  const showNav = isAuthenticated && !isAuthPage && !isLanding;

  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-background">
      <main className={showNav ? 'pb-16' : ''}>{children}</main>
      {showNav && <BottomNav slug={slug} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function SlugLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setCurrentSlug(slug);

    api
      .get<OrgInfo>(`/portal/${slug}`)
      .then((data) => setOrg(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[480px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !org) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl">☕</div>
        <h1 className="text-2xl font-bold">Cafe not found</h1>
        <p className="text-muted-foreground">
          We couldn&apos;t find a cafe with that address. Please check the URL and try again.
        </p>
      </div>
    );
  }

  return (
    <OrgContext.Provider value={org}>
      <CustomerAuthProvider>
        <PortalShell slug={slug}>{children}</PortalShell>
      </CustomerAuthProvider>
    </OrgContext.Provider>
  );
}
