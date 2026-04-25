'use client';

import { createContext, useContext } from 'react';

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  operatingHours?: unknown;
  socialMedia?: unknown;
}

export const OrgContext = createContext<OrgInfo | null>(null);

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within [slug] layout');
  return ctx;
}
