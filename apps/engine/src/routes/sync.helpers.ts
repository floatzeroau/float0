import { eq, and, gt, lte, isNull, isNotNull } from 'drizzle-orm';
import { db } from '../db/connection.js';
import {
  categories,
  products,
  modifierGroups,
  modifiers,
  productModifierGroups,
  customers,
  orders,
  orderItems,
  payments,
  shifts,
} from '../db/schema/pos.js';
import { orgMemberships, users } from '../db/schema/core.js';

// ── Types ──────────────────────────────────────────────

interface SyncTableChanges {
  created: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  deleted: string[];
}

interface SyncChanges {
  products: SyncTableChanges;
  modifier_groups: SyncTableChanges;
  modifiers: SyncTableChanges;
  product_modifier_groups: SyncTableChanges;
  categories: SyncTableChanges;
  customers: SyncTableChanges;
  staff: SyncTableChanges;
  orders: SyncTableChanges;
  order_items: SyncTableChanges;
  payments: SyncTableChanges;
  shifts: SyncTableChanges;
}

const emptyChanges: SyncTableChanges = { created: [], updated: [], deleted: [] };

// ── Helpers ────────────────────────────────────────────

function toMs(date: Date): number {
  return date.getTime();
}

function fromMs(ms: number): Date {
  return new Date(ms);
}

// Drizzle with casing: 'snake_case' returns camelCase keys in JS.
// WatermelonDB expects snake_case keys. Convert and add id = server UUID.
function toWmRaw(row: Record<string, unknown>): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    // Convert camelCase to snake_case
    const snakeKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    if (value instanceof Date) {
      raw[snakeKey] = toMs(value);
    } else {
      raw[snakeKey] = value;
    }
  }
  // WatermelonDB uses `id` as the record ID. We mirror the server UUID.
  raw['server_id'] = raw['id'];
  // Remove org-scoped and internal fields that WatermelonDB doesn't need
  delete raw['organization_id'];
  delete raw['deleted_at'];
  delete raw['_version'];
  return raw;
}

// ── Pull tables config ─────────────────────────────────

const pullTables = [
  { name: 'categories' as const, table: categories },
  { name: 'products' as const, table: products },
  { name: 'modifier_groups' as const, table: modifierGroups },
  { name: 'modifiers' as const, table: modifiers },
  { name: 'product_modifier_groups' as const, table: productModifierGroups },
  { name: 'customers' as const, table: customers },
] as const;

// ── Pull ───────────────────────────────────────────────

async function pullTable(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  orgId: string,
  since: Date | null,
): Promise<SyncTableChanges> {
  if (since === null) {
    // Initial sync: all non-deleted records as created
    const rows = await db
      .select()
      .from(table)
      .where(and(eq(table.organizationId, orgId), isNull(table.deletedAt)));
    return {
      created: rows.map((r: Record<string, unknown>) => toWmRaw(r)),
      updated: [],
      deleted: [],
    };
  }

  // Incremental sync
  const created = await db
    .select()
    .from(table)
    .where(
      and(eq(table.organizationId, orgId), gt(table.createdAt, since), isNull(table.deletedAt)),
    );

  const updated = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.organizationId, orgId),
        gt(table.updatedAt, since),
        lte(table.createdAt, since),
        isNull(table.deletedAt),
      ),
    );

  const deletedRows = await db
    .select({ id: table.id })
    .from(table)
    .where(
      and(eq(table.organizationId, orgId), isNotNull(table.deletedAt), gt(table.deletedAt, since)),
    );

  return {
    created: created.map((r: Record<string, unknown>) => toWmRaw(r)),
    updated: updated.map((r: Record<string, unknown>) => toWmRaw(r)),
    deleted: deletedRows.map((r: { id: string }) => r.id),
  };
}

async function pullStaff(orgId: string, since: Date | null): Promise<SyncTableChanges> {
  // Staff is virtual — synthesized from orgMemberships JOIN users
  const baseConditions = [eq(orgMemberships.organizationId, orgId)];

  const allMembers = await db
    .select({
      id: orgMemberships.id,
      firstName: users.firstName,
      lastName: users.lastName,
      role: orgMemberships.role,
      pinHash: orgMemberships.pinHash,
      isActive: users.isActive,
      permissions: orgMemberships.permissions,
      createdAt: orgMemberships.createdAt,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(and(...baseConditions));

  function toStaffRaw(row: (typeof allMembers)[number]): Record<string, unknown> {
    return {
      id: row.id,
      server_id: row.id,
      first_name: row.firstName,
      last_name: row.lastName,
      role: row.role,
      pin_hash: row.pinHash ?? '',
      is_active: row.isActive,
      permissions_json: JSON.stringify(row.permissions ?? []),
      created_at: toMs(row.createdAt),
      updated_at: toMs(row.createdAt), // orgMemberships doesn't have updatedAt
    };
  }

  if (since === null) {
    return {
      created: allMembers.filter((m) => m.isActive).map(toStaffRaw),
      updated: [],
      deleted: [],
    };
  }

  // For incremental, return all active as created (simplified — staff rarely changes)
  // A full implementation would track membership timestamps more precisely
  const created = allMembers.filter((m) => m.isActive && m.createdAt > since);
  return {
    created: created.map(toStaffRaw),
    updated: [],
    deleted: [],
  };
}

export async function pullAllChanges(
  orgId: string,
  lastPulledAt: number | null,
): Promise<{ changes: SyncChanges; timestamp: number }> {
  const since = lastPulledAt !== null ? fromMs(lastPulledAt) : null;
  const timestamp = Date.now();

  const changes: SyncChanges = {
    products: emptyChanges,
    modifier_groups: emptyChanges,
    modifiers: emptyChanges,
    product_modifier_groups: emptyChanges,
    categories: emptyChanges,
    customers: emptyChanges,
    staff: emptyChanges,
    orders: emptyChanges,
    order_items: emptyChanges,
    payments: emptyChanges,
    shifts: emptyChanges,
  };

  // Pull server-managed tables
  for (const { name, table } of pullTables) {
    changes[name] = await pullTable(table, orgId, since);
  }

  // Pull virtual staff table
  changes.staff = await pullStaff(orgId, since);

  return { changes, timestamp };
}

// ── Push tables config ─────────────────────────────────

const pushTableMap = {
  orders: orders,
  order_items: orderItems,
  payments: payments,
  shifts: shifts,
} as const;

// ── Push ───────────────────────────────────────────────

export async function pushAllChanges(
  orgId: string,
  changes: Partial<Record<string, SyncTableChanges>>,
  _lastPulledAt: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [tableName, tableRef] of Object.entries(pushTableMap)) {
      const tableChanges = changes[tableName];
      if (!tableChanges) continue;

      // Handle created records
      if (tableChanges.created.length > 0) {
        for (const raw of tableChanges.created) {
          const record = wmRawToServer(raw as Record<string, unknown>, orgId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await tx
            .insert(tableRef)
            .values(record as any)
            .onConflictDoNothing();
        }
      }

      // Handle updated records
      if (tableChanges.updated.length > 0) {
        for (const raw of tableChanges.updated) {
          const record = wmRawToServer(raw as Record<string, unknown>, orgId);
          const id = record.id as string;
          delete record.id;
          await tx
            .update(tableRef)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set({ ...record, updatedAt: new Date() } as any)
            .where(and(eq(tableRef.id, id), eq(tableRef.organizationId, orgId)));
        }
      }

      // Handle deleted records
      if (tableChanges.deleted.length > 0) {
        for (const id of tableChanges.deleted) {
          await tx
            .update(tableRef)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .set({ deletedAt: new Date() } as any)
            .where(and(eq(tableRef.id, id as string), eq(tableRef.organizationId, orgId)));
        }
      }
    }
  });
}

// Convert WatermelonDB snake_case raw to server camelCase record
function wmRawToServer(raw: Record<string, unknown>, orgId: string): Record<string, unknown> {
  const record: Record<string, unknown> = { organizationId: orgId };

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'server_id' || key === '_status' || key === '_changed') continue;
    // Convert snake_case to camelCase
    const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    // Convert timestamp ms fields to Date objects
    if (
      (camelKey === 'createdAt' ||
        camelKey === 'updatedAt' ||
        camelKey === 'openedAt' ||
        camelKey === 'closedAt') &&
      typeof value === 'number'
    ) {
      record[camelKey] = fromMs(value);
    } else {
      record[camelKey] = value;
    }
  }

  return record;
}
