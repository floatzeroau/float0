import { describe, it, expect } from 'vitest';
import {
  ROLE_HIERARCHY,
  getEffectivePermissions,
  DEFAULT_PERMISSIONS,
  OWNER_PERMISSIONS,
  ADMIN_PERMISSIONS,
  MANAGER_PERMISSIONS,
  STAFF_PERMISSIONS,
  CUSTOMER_PERMISSIONS,
} from '@float0/shared';
import type { OrgRole } from '@float0/shared';

describe('ROLE_HIERARCHY', () => {
  it('defines correct hierarchy levels', () => {
    expect(ROLE_HIERARCHY.owner).toBe(5);
    expect(ROLE_HIERARCHY.admin).toBe(4);
    expect(ROLE_HIERARCHY.manager).toBe(3);
    expect(ROLE_HIERARCHY.staff).toBe(2);
    expect(ROLE_HIERARCHY.customer).toBe(1);
  });

  it('owner > admin > manager > staff > customer', () => {
    const roles: OrgRole[] = ['customer', 'staff', 'manager', 'admin', 'owner'];
    for (let i = 1; i < roles.length; i++) {
      expect(ROLE_HIERARCHY[roles[i]]).toBeGreaterThan(ROLE_HIERARCHY[roles[i - 1]]);
    }
  });

  it('requireRole("manager") allows owner, admin, manager', () => {
    const minLevel = ROLE_HIERARCHY.manager;
    expect(ROLE_HIERARCHY.owner).toBeGreaterThanOrEqual(minLevel);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThanOrEqual(minLevel);
    expect(ROLE_HIERARCHY.manager).toBeGreaterThanOrEqual(minLevel);
    expect(ROLE_HIERARCHY.staff).toBeLessThan(minLevel);
    expect(ROLE_HIERARCHY.customer).toBeLessThan(minLevel);
  });

  it('requireRole("admin") allows owner, admin only', () => {
    const minLevel = ROLE_HIERARCHY.admin;
    expect(ROLE_HIERARCHY.owner).toBeGreaterThanOrEqual(minLevel);
    expect(ROLE_HIERARCHY.admin).toBeGreaterThanOrEqual(minLevel);
    expect(ROLE_HIERARCHY.manager).toBeLessThan(minLevel);
    expect(ROLE_HIERARCHY.staff).toBeLessThan(minLevel);
    expect(ROLE_HIERARCHY.customer).toBeLessThan(minLevel);
  });

  it('requireRole("owner") allows only owner', () => {
    const minLevel = ROLE_HIERARCHY.owner;
    expect(ROLE_HIERARCHY.owner).toBeGreaterThanOrEqual(minLevel);
    expect(ROLE_HIERARCHY.admin).toBeLessThan(minLevel);
  });
});

describe('DEFAULT_PERMISSIONS', () => {
  it('owner has all permissions', () => {
    expect(OWNER_PERMISSIONS).toContain('billing.manage');
    expect(OWNER_PERMISSIONS).toContain('org.manage');
    expect(OWNER_PERMISSIONS).toContain('products.can_edit');
    expect(OWNER_PERMISSIONS).toContain('orders.can_refund');
  });

  it('admin has all except billing and org.delete', () => {
    expect(ADMIN_PERMISSIONS).not.toContain('billing.manage');
    expect(ADMIN_PERMISSIONS).not.toContain('org.delete');
    expect(ADMIN_PERMISSIONS).toContain('org.manage');
    expect(ADMIN_PERMISSIONS).toContain('products.can_edit');
  });

  it('manager has operations but not org/billing', () => {
    expect(MANAGER_PERMISSIONS).toContain('orders.can_refund');
    expect(MANAGER_PERMISSIONS).toContain('orders.can_void');
    expect(MANAGER_PERMISSIONS).toContain('reports.can_view');
    const managerArr = [...MANAGER_PERMISSIONS];
    expect(managerArr).not.toContain('billing.manage');
    expect(managerArr).not.toContain('org.manage');
    expect(managerArr).not.toContain('users.manage');
  });

  it('staff has POS-only permissions', () => {
    expect(STAFF_PERMISSIONS).toContain('orders.can_create');
    expect(STAFF_PERMISSIONS).toContain('payments.can_process');
    const staffArr = [...STAFF_PERMISSIONS];
    expect(staffArr).not.toContain('orders.can_refund');
    expect(staffArr).not.toContain('reports.can_view');
    expect(staffArr).not.toContain('products.can_edit');
  });

  it('customer has portal-only permissions', () => {
    expect(CUSTOMER_PERMISSIONS).toContain('orders.can_view');
    expect(CUSTOMER_PERMISSIONS).toContain('loyalty.can_view');
    const customerArr = [...CUSTOMER_PERMISSIONS];
    expect(customerArr).not.toContain('orders.can_create');
    expect(customerArr).not.toContain('payments.can_process');
  });

  it('every role has an entry in DEFAULT_PERMISSIONS', () => {
    const roles: OrgRole[] = ['owner', 'admin', 'manager', 'staff', 'customer'];
    for (const role of roles) {
      expect(DEFAULT_PERMISSIONS[role]).toBeDefined();
      expect(DEFAULT_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});

describe('getEffectivePermissions', () => {
  it('returns defaults when no overrides', () => {
    const perms = getEffectivePermissions('staff');
    expect(perms).toEqual(expect.arrayContaining([...STAFF_PERMISSIONS]));
    expect(perms.length).toBe(STAFF_PERMISSIONS.length);
  });

  it('returns defaults when overrides is empty array', () => {
    const perms = getEffectivePermissions('staff', []);
    expect(perms).toEqual(expect.arrayContaining([...STAFF_PERMISSIONS]));
  });

  it('merges overrides with defaults (deduped)', () => {
    const perms = getEffectivePermissions('staff', ['orders.can_refund', 'orders.can_create']);
    expect(perms).toContain('orders.can_refund');
    expect(perms).toContain('orders.can_create');
    expect(perms).toContain('payments.can_process');
    // orders.can_create is in both — should not be duplicated
    const createCount = perms.filter((p) => p === 'orders.can_create').length;
    expect(createCount).toBe(1);
  });

  it('returns empty for unknown role', () => {
    const perms = getEffectivePermissions('unknown_role');
    expect(perms).toEqual([]);
  });

  it('permission check works with includes()', () => {
    const perms = getEffectivePermissions('manager');
    expect(perms.includes('orders.can_refund')).toBe(true);
    expect(perms.includes('billing.manage')).toBe(false);
  });
});
