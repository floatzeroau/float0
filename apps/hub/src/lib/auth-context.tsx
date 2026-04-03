'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, getAccessToken, clearTokens } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Organization {
  id: string;
  name: string;
  abn?: string;
  timezone: string;
  currency: string;
  settings: Record<string, unknown>;
  [key: string]: unknown;
}

interface User {
  userId: string;
  orgId: string;
  role: string;
}

interface AuthState {
  user: User | null;
  org: Organization | null;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  org: null,
  isLoading: true,
  logout: () => {},
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode JWT payload without verifying signature (client-side only). */
function decodeToken(token: string): User | null {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return {
      userId: decoded.userId,
      orgId: decoded.orgId,
      role: decoded.role,
    };
  } catch {
    return null;
  }
}

const PUBLIC_PATHS = ['/login', '/forgot-password', '/register', '/auth/setup-account'];

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [org, setOrg] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    setOrg(null);
    router.push('/login');
  }, [router]);

  // Listen for forced logout from api.ts (401 after refresh failure)
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, [logout]);

  // Hydrate auth state on mount
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const token = getAccessToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      const decoded = decodeToken(token);
      if (!decoded) {
        clearTokens();
        setIsLoading(false);
        return;
      }

      setUser(decoded);

      try {
        const orgData = await api.get<Organization>('/organizations/me');
        if (!cancelled) setOrg(orgData);
      } catch {
        // Token might be expired — the api client will try refresh.
        // If that also fails, the auth:logout event fires.
      }

      if (!cancelled) setIsLoading(false);
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Route protection — redirect unauthenticated users away from protected routes
  useEffect(() => {
    if (isLoading) return;

    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

    if (!user && !isPublic) {
      router.replace('/login');
    }
  }, [isLoading, user, pathname, router]);

  const value = useMemo(() => ({ user, org, isLoading, logout }), [user, org, isLoading, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
