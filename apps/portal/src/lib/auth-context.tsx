'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiClientError, getAccessToken, setTokens, clearTokens } from './api';

interface CustomerProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  emailVerified: boolean;
  loyaltyTier?: string | null;
  loyaltyBalance: number;
  createdAt: string;
}

interface AuthContextValue {
  customer: CustomerProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (slug: string, email: string, password: string) => Promise<void>;
  register: (
    slug: string,
    data: { firstName: string; lastName: string; email: string; password: string; phone?: string },
  ) => Promise<void>;
  logout: () => void;
  refreshProfile: (slug: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within CustomerAuthProvider');
  return ctx;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  customer: CustomerProfile;
}

export function CustomerAuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Listen for forced logout
  useEffect(() => {
    function handleLogout() {
      setCustomer(null);
    }
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  // Try to load profile on mount if token exists
  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Extract slug from URL to fetch profile
    const slug = window.location.pathname.split('/')[1];
    if (!slug) {
      setIsLoading(false);
      return;
    }

    api
      .get<CustomerProfile>(`/portal/${slug}/me`)
      .then((profile) => setCustomer(profile))
      .catch(() => {
        clearTokens();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (slug: string, email: string, password: string) => {
    const res = await api.post<AuthResponse>(`/portal/${slug}/auth/login`, { email, password });
    setTokens(res.accessToken, res.refreshToken);
    setCustomer(res.customer);
  }, []);

  const register = useCallback(
    async (
      slug: string,
      data: {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        phone?: string;
      },
    ) => {
      const res = await api.post<AuthResponse>(`/portal/${slug}/auth/register`, data);
      setTokens(res.accessToken, res.refreshToken);
      setCustomer(res.customer);
    },
    [],
  );

  const logout = useCallback(() => {
    clearTokens();
    setCustomer(null);
  }, []);

  const refreshProfile = useCallback(async (slug: string) => {
    const profile = await api.get<CustomerProfile>(`/portal/${slug}/me`);
    setCustomer(profile);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        customer,
        isLoading,
        isAuthenticated: !!customer,
        login,
        register,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
