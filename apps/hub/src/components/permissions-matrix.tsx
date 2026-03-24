'use client';

import { Check, X, Info } from 'lucide-react';
import { DEFAULT_PERMISSIONS } from '@float0/shared';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Permission categories
// ---------------------------------------------------------------------------

interface PermissionCategory {
  label: string;
  description: string;
  permissions: { key: string; label: string }[];
}

const categories: PermissionCategory[] = [
  {
    label: 'Products',
    description: 'Create, edit, and manage products, categories, and modifiers',
    permissions: [
      { key: 'products.can_view', label: 'View' },
      { key: 'products.can_edit', label: 'Edit' },
      { key: 'products.can_delete', label: 'Delete' },
    ],
  },
  {
    label: 'Inventory',
    description: 'View and manage stock levels and inventory adjustments',
    permissions: [
      { key: 'inventory.can_view', label: 'View' },
      { key: 'inventory.can_edit', label: 'Edit' },
    ],
  },
  {
    label: 'Orders',
    description: 'Create orders, process refunds, void transactions, and apply discounts',
    permissions: [
      { key: 'orders.can_view', label: 'View' },
      { key: 'orders.can_create', label: 'Create' },
      { key: 'orders.can_refund', label: 'Refund' },
      { key: 'orders.can_void', label: 'Void' },
      { key: 'orders.can_discount', label: 'Discount' },
    ],
  },
  {
    label: 'Payments',
    description: 'Process payments via cash, card, and other methods',
    permissions: [{ key: 'payments.can_process', label: 'Process' }],
  },
  {
    label: 'Shifts',
    description: 'View all shifts and manage open/close operations',
    permissions: [
      { key: 'shifts.can_view_all', label: 'View All' },
      { key: 'shifts.can_manage', label: 'Manage' },
    ],
  },
  {
    label: 'Reports',
    description: 'Access sales reports, analytics, and data exports',
    permissions: [
      { key: 'reports.can_view', label: 'View' },
      { key: 'reports.can_export', label: 'Export' },
    ],
  },
  {
    label: 'Customers',
    description: 'View and edit customer records and contact information',
    permissions: [
      { key: 'customers.can_view', label: 'View' },
      { key: 'customers.can_edit', label: 'Edit' },
    ],
  },
  {
    label: 'Loyalty',
    description: 'View and manage loyalty programs, tiers, and balances',
    permissions: [
      { key: 'loyalty.can_view', label: 'View' },
      { key: 'loyalty.can_manage', label: 'Manage' },
    ],
  },
  {
    label: 'Staff',
    description: 'Invite, manage, and remove team members',
    permissions: [
      { key: 'users.manage', label: 'Manage' },
      { key: 'users.invite', label: 'Invite' },
      { key: 'users.remove', label: 'Remove' },
    ],
  },
  {
    label: 'Settings',
    description: 'Edit organization settings, POS configuration, and billing',
    permissions: [
      { key: 'settings.can_edit', label: 'Edit' },
      { key: 'org.manage', label: 'Org' },
      { key: 'billing.manage', label: 'Billing' },
    ],
  },
];

const roles = ['owner', 'admin', 'manager', 'staff'] as const;

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff',
};

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'default',
  manager: 'secondary',
  staff: 'outline',
};

function hasPermission(role: string, permission: string): boolean {
  const perms = DEFAULT_PERMISSIONS[role as keyof typeof DEFAULT_PERMISSIONS];
  if (!perms) return false;
  return (perms as readonly string[]).includes(permission);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PermissionsMatrix() {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {categories.map((category) => {
          // Check if any role has any of these permissions
          const hasAnyPerms = roles.some((role) =>
            category.permissions.some((p) => hasPermission(role, p.key)),
          );
          if (!hasAnyPerms) return null;

          return (
            <div key={category.label} className="rounded-md border">
              <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3">
                <span className="text-sm font-medium">{category.label}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-64">
                    {category.description}
                  </TooltipContent>
                </Tooltip>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Permission</TableHead>
                    {roles.map((role) => (
                      <TableHead key={role} className="text-center">
                        <Badge variant={roleBadgeVariant[role]}>{roleLabels[role]}</Badge>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {category.permissions.map((perm) => (
                    <TableRow key={perm.key}>
                      <TableCell className="text-sm text-muted-foreground">{perm.label}</TableCell>
                      {roles.map((role) => {
                        const allowed = hasPermission(role, perm.key);
                        return (
                          <TableCell key={role} className="text-center">
                            {allowed ? (
                              <Check className="mx-auto h-4 w-4 text-emerald-600" />
                            ) : (
                              <X className="mx-auto h-4 w-4 text-muted-foreground/30" />
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
