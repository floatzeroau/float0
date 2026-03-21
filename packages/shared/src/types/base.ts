export interface OrgReceiptSettings {
  headerText?: string;
  footerText?: string;
  socialMedia?: string;
  logoUrl?: string;
  showLoyaltyBalance?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  abn: string;
  timezone: string;
  currency: string;
  settings: {
    receipt?: OrgReceiptSettings;
    [key: string]: unknown;
  };
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

export type OrgMembershipRole = 'owner' | 'admin' | 'manager' | 'staff' | 'customer';

export interface OrgMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: OrgMembershipRole;
  permissions: string[];
}

export interface AuditLogEntry {
  id: string;
  organizationId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, unknown>;
  createdAt: Date;
}
