export type OrgRole = 'owner' | 'admin' | 'manager' | 'staff' | 'customer';

export const ROLE_HIERARCHY: Record<OrgRole, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  staff: 2,
  customer: 1,
};

// ── Permission definitions ─────────────────────────────

export const OWNER_PERMISSIONS = [
  'billing.manage',
  'org.manage',
  'org.delete',
  'users.manage',
  'users.invite',
  'users.remove',
  'products.can_view',
  'products.can_edit',
  'products.can_delete',
  'inventory.can_view',
  'inventory.can_edit',
  'orders.can_view',
  'orders.can_create',
  'orders.can_refund',
  'orders.can_void',
  'orders.can_discount',
  'payments.can_process',
  'shifts.can_view_all',
  'shifts.can_manage',
  'reports.can_view',
  'reports.can_export',
  'loyalty.can_view',
  'loyalty.can_manage',
  'customers.can_view',
  'customers.can_edit',
  'settings.can_edit',
] as const;

export const ADMIN_PERMISSIONS = OWNER_PERMISSIONS.filter(
  (p) => !p.startsWith('billing.') && p !== 'org.delete',
);

export const MANAGER_PERMISSIONS = [
  'products.can_view',
  'products.can_edit',
  'inventory.can_view',
  'inventory.can_edit',
  'orders.can_view',
  'orders.can_create',
  'orders.can_refund',
  'orders.can_void',
  'orders.can_discount',
  'payments.can_process',
  'shifts.can_view_all',
  'shifts.can_manage',
  'reports.can_view',
  'reports.can_export',
  'loyalty.can_view',
  'loyalty.can_manage',
  'customers.can_view',
  'customers.can_edit',
] as const;

export const STAFF_PERMISSIONS = [
  'products.can_view',
  'orders.can_view',
  'orders.can_create',
  'payments.can_process',
  'customers.can_view',
] as const;

export const CUSTOMER_PERMISSIONS = [
  'orders.can_view',
  'loyalty.can_view',
  'customers.can_view',
  'customers.can_edit',
] as const;

export const DEFAULT_PERMISSIONS: Record<OrgRole, readonly string[]> = {
  owner: OWNER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  staff: STAFF_PERMISSIONS,
  customer: CUSTOMER_PERMISSIONS,
};

export function getEffectivePermissions(role: string, overrides?: string[]): string[] {
  const defaults = DEFAULT_PERMISSIONS[role as OrgRole] ?? [];
  if (!overrides || overrides.length === 0) {
    return [...defaults];
  }
  // Merge: union of defaults + overrides (deduped)
  return [...new Set([...defaults, ...overrides])];
}
