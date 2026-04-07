import { eq, and, gt, lte, isNull, isNotNull, desc, sql, inArray } from 'drizzle-orm';
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
  cashMovements,
  syncConflicts,
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
  cash_movements: SyncTableChanges;
}

export interface RejectedRecord {
  table: string;
  id: string;
  reason: 'conflict_server_wins';
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
    cash_movements: emptyChanges,
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

// Explicit dependency order: parents before children
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PUSH_TABLE_ORDER: { name: string; table: any }[] = [
  { name: 'orders', table: orders },
  { name: 'shifts', table: shifts },
  { name: 'order_items', table: orderItems },
  { name: 'payments', table: payments },
  { name: 'cash_movements', table: cashMovements },
];

// FK fields that may reference WatermelonDB local IDs needing remapping
const FK_REMAP_FIELDS: Record<string, string[]> = {
  order_items: ['order_id'],
  payments: ['order_id'],
  cash_movements: ['shift_id'],
};

// Tables where server data is authoritative (catalog data)
const SERVER_WINS_TABLES = new Set([
  'categories',
  'products',
  'modifier_groups',
  'modifiers',
  'product_modifier_groups',
  'customers',
]);

// ── Push ───────────────────────────────────────────────

export async function pushAllChanges(
  orgId: string,
  userId: string,
  changes: Partial<Record<string, SyncTableChanges>>,
  lastPulledAt: number,
): Promise<{ rejected: RejectedRecord[] }> {
  const rejected: RejectedRecord[] = [];
  const since = fromMs(lastPulledAt);

  // Look up the org membership ID for the pushing user to use as fallback staffId.
  // staffId in the POS schema references orgMemberships.id, not users.id.
  let fallbackStaffId: string | undefined;
  const [membership] = await db
    .select({ id: orgMemberships.id })
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, userId), eq(orgMemberships.organizationId, orgId)))
    .limit(1);
  if (membership) {
    fallbackStaffId = membership.id;
  }

  // Map of WatermelonDB local IDs → server UUIDs for FK remapping
  const idRemap = new Map<string, string>();

  await db.transaction(async (tx) => {
    let spIdx = 0;

    for (const { name: tableName, table: tableRef } of PUSH_TABLE_ORDER) {
      const tableChanges = changes[tableName];
      if (!tableChanges) continue;

      const isServerWins = SERVER_WINS_TABLES.has(tableName);
      const fkFields = FK_REMAP_FIELDS[tableName];

      // Handle created records
      if (tableChanges.created.length > 0) {
        for (const raw of tableChanges.created) {
          const rawObj = raw as Record<string, unknown>;

          // Remap FK fields that reference WM local IDs before conversion
          if (fkFields) {
            for (const fk of fkFields) {
              const fkVal = rawObj[fk];
              if (typeof fkVal === 'string' && idRemap.has(fkVal)) {
                rawObj[fk] = idRemap.get(fkVal)!;
              }
            }
          }

          // Capture the WM local ID before conversion
          const wmLocalId = typeof rawObj['id'] === 'string' ? rawObj['id'] : null;

          const record = wmRawToServer(rawObj, orgId, fallbackStaffId);
          const newServerId = record.id as string;

          // If the server generated a new UUID, add to remap
          if (wmLocalId && wmLocalId !== newServerId) {
            idRemap.set(wmLocalId, newServerId);
          }

          // Validate before insert
          const err = validateRecord(tableName, record);
          if (err) {
            console.warn(`Sync push: skipping ${tableName} create — ${err}`, record.id);
            continue;
          }

          const sp = `sp_${spIdx++}`;
          await tx.execute(sql.raw(`SAVEPOINT ${sp}`));
          try {
            await tx
              .insert(tableRef)
              .values({ ...record, _version: 1 } as any)
              .onConflictDoNothing();
          } catch (insertErr) {
            console.error(`Sync push: failed to insert ${tableName} record:`, insertErr);
            await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`));
          }
        }
      }

      // Handle updated records — with conflict detection
      if (tableChanges.updated.length > 0) {
        for (const raw of tableChanges.updated) {
          const rawObj = raw as Record<string, unknown>;

          // Remap FK fields for updates too
          if (fkFields) {
            for (const fk of fkFields) {
              const fkVal = rawObj[fk];
              if (typeof fkVal === 'string' && idRemap.has(fkVal)) {
                rawObj[fk] = idRemap.get(fkVal)!;
              }
            }
          }

          const record = wmRawToServer(rawObj, orgId, fallbackStaffId);
          const id = record.id as string;
          delete record.id;

          if (!id || !UUID_RE.test(id)) {
            console.warn(`Sync push: skipping ${tableName} update — invalid id`);
            continue;
          }

          // Fetch current server state
          const [existing] = await tx
            .select()
            .from(tableRef)
            .where(and(eq(tableRef.id, id), eq(tableRef.organizationId, orgId)));

          if (!existing) continue;

          const serverRow = existing as Record<string, unknown>;
          const serverUpdatedAt = serverRow.updatedAt as Date;
          const serverVersion = (serverRow._version as number) ?? 1;
          const hasConflict = serverUpdatedAt > since;

          if (hasConflict) {
            // Log the conflict
            await tx.insert(syncConflicts).values({
              organizationId: orgId,
              entityType: tableName,
              entityId: id,
              localVersion: serverVersion,
              serverVersion: serverVersion,
              resolution: isServerWins ? 'server_wins' : 'device_wins',
              localData: record,
              serverData: serverRow,
              terminalId: (record.terminalId as string) ?? null,
            });

            if (isServerWins) {
              // Reject the push — server data is authoritative
              rejected.push({ table: tableName, id, reason: 'conflict_server_wins' });
              continue;
            }
            // Device wins — fall through to apply the update
          }

          const sp = `sp_${spIdx++}`;
          await tx.execute(sql.raw(`SAVEPOINT ${sp}`));
          try {
            await tx
              .update(tableRef)
              .set({
                ...record,
                updatedAt: new Date(),
                _version: serverVersion + 1,
              } as any)
              .where(and(eq(tableRef.id, id), eq(tableRef.organizationId, orgId)));
          } catch (updateErr) {
            console.error(`Sync push: failed to update ${tableName} record ${id}:`, updateErr);
            await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`));
          }
        }
      }

      // Handle deleted records — increment version
      if (tableChanges.deleted.length > 0) {
        for (const id of tableChanges.deleted) {
          if (!id || !UUID_RE.test(id)) continue;

          const [existing] = await tx
            .select({ _version: tableRef._version })
            .from(tableRef)
            .where(and(eq(tableRef.id, id as string), eq(tableRef.organizationId, orgId)));

          const currentVersion = (existing?._version as number) ?? 1;

          await tx
            .update(tableRef)
            .set({ deletedAt: new Date(), _version: currentVersion + 1 } as any)
            .where(and(eq(tableRef.id, id as string), eq(tableRef.organizationId, orgId)));
        }
      }
    }
  });

  return { rejected };
}

// UUID fields that must be null (not empty/invalid string) when absent
const NULLABLE_UUID_FIELDS = new Set([
  'customerId',
  'orderId',
  'productId',
  'shiftId',
  'managerApproverId',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Timestamp fields that should be converted from ms to Date
const TIMESTAMP_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'openedAt',
  'closedAt',
  'voidedAt',
  'heldAt',
]);

// NOT NULL UUID fields that need a fallback value from auth context
const NOT_NULL_UUID_FIELDS = new Set(['staffId']);

// Convert WatermelonDB snake_case raw to server camelCase record.
// - Resolves `id` from server_id or generates a new UUID for POS-created records.
// - Uses fallbackStaffId for invalid staffId values (e.g. old "pos-terminal" records).
function wmRawToServer(
  raw: Record<string, unknown>,
  orgId: string,
  fallbackStaffId?: string,
): Record<string, unknown> {
  const record: Record<string, unknown> = { organizationId: orgId };

  // Resolve the server ID for this record:
  // 1. If server_id is a valid UUID, use it (record was pulled from server previously)
  // 2. If the WM id is a valid UUID, use it
  // 3. Otherwise, generate a new UUID (POS-created record with local WM id)
  const serverId = raw['server_id'];
  const wmId = raw['id'];
  if (typeof serverId === 'string' && UUID_RE.test(serverId)) {
    record.id = serverId;
  } else if (typeof wmId === 'string' && UUID_RE.test(wmId)) {
    record.id = wmId;
  } else {
    record.id = crypto.randomUUID();
  }

  for (const [key, value] of Object.entries(raw)) {
    // Skip WM internal fields and id (already resolved above)
    if (key === 'id' || key === 'server_id' || key === '_status' || key === '_changed') continue;
    // Convert snake_case to camelCase
    const camelKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    // Convert timestamp ms fields to Date objects
    if (TIMESTAMP_FIELDS.has(camelKey) && typeof value === 'number') {
      record[camelKey] = fromMs(value);
    } else if (
      NULLABLE_UUID_FIELDS.has(camelKey) &&
      (value === '' || value === null || (typeof value === 'string' && !UUID_RE.test(value)))
    ) {
      // Nullable UUID columns: invalid values become null
      record[camelKey] = null;
    } else if (
      NOT_NULL_UUID_FIELDS.has(camelKey) &&
      (value === '' || value === null || (typeof value === 'string' && !UUID_RE.test(value)))
    ) {
      // NOT NULL UUID columns: use fallback from auth context
      record[camelKey] = fallbackStaffId ?? null;
    } else if (camelKey === 'modifiersJson' && typeof value === 'string') {
      // jsonb column expects parsed JSON, not a string
      try {
        record[camelKey] = JSON.parse(value);
      } catch {
        record[camelKey] = value;
      }
    } else {
      record[camelKey] = value;
    }
  }

  return record;
}

// Required fields per push table — records missing these are skipped
const REQUIRED_FIELDS: Record<string, string[]> = {
  orders: ['id', 'staffId', 'terminalId'],
  order_items: ['id', 'orderId'],
  payments: ['id', 'orderId'],
  shifts: ['id', 'staffId'],
  cash_movements: ['id', 'shiftId', 'staffId'],
};

function validateRecord(tableName: string, record: Record<string, unknown>): string | null {
  const required = REQUIRED_FIELDS[tableName];
  if (!required) return null;
  for (const field of required) {
    const val = record[field];
    if (val === null || val === undefined || val === '') {
      return `missing required field "${field}"`;
    }
  }
  // Validate that id is a proper UUID
  if (typeof record.id === 'string' && !UUID_RE.test(record.id)) {
    return `invalid UUID for id: "${record.id}"`;
  }
  return null;
}

// ── Sync Status ────────────────────────────────────────

export async function getSyncStatus(
  orgId: string,
): Promise<{ lastSyncAt: number | null; pendingPushCount: number }> {
  // Approximate lastSyncAt: most recent updatedAt across push tables
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pushTables: any[] = [orders, orderItems, payments, shifts, cashMovements];
  let lastSyncAt: number | null = null;

  for (const table of pushTables) {
    const [row] = await db
      .select({ updatedAt: table.updatedAt })
      .from(table)
      .where(eq(table.organizationId, orgId))
      .orderBy(desc(table.updatedAt))
      .limit(1);

    if (row?.updatedAt) {
      const ts = (row.updatedAt as Date).getTime();
      if (lastSyncAt === null || ts > lastSyncAt) {
        lastSyncAt = ts;
      }
    }
  }

  // pendingPushCount is a client-side concept; server returns 0 as placeholder
  return { lastSyncAt, pendingPushCount: 0 };
}
