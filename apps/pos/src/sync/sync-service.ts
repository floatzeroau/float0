import { synchronize } from '@nozbe/watermelondb/sync';
import type { Database } from '@nozbe/watermelondb';
import * as SecureStore from 'expo-secure-store';
import { API_URL, AUTH_TOKEN_KEY } from '../config';

async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

export interface SyncResult {
  conflictCount: number;
}

// FK fields in child tables that reference parent WM local IDs and need
// remapping to the parent's server_id before pushing to the server.
const FK_REMAP_CONFIG: Record<string, { fk: string; parentTable: string }[]> = {
  order_items: [{ fk: 'order_id', parentTable: 'orders' }],
  payments: [{ fk: 'order_id', parentTable: 'orders' }],
  cash_movements: [{ fk: 'shift_id', parentTable: 'shifts' }],
};

/**
 * Before pushing changes to the server, remap FK fields in child records
 * from WM local IDs to the parent record's server_id. This ensures the
 * server receives proper UUIDs even when parent records were pushed in
 * a previous sync cycle.
 */
async function remapForeignKeys(
  database: Database,
  changes: Record<
    string,
    { created: Record<string, unknown>[]; updated: Record<string, unknown>[]; deleted: string[] }
  >,
): Promise<typeof changes> {
  // Collect all parent WM IDs we need to resolve
  const parentIdsNeeded = new Map<string, Set<string>>(); // parentTable → Set<wmLocalId>

  for (const [tableName, config] of Object.entries(FK_REMAP_CONFIG)) {
    const tableChanges = changes[tableName];
    if (!tableChanges) continue;

    for (const { fk, parentTable } of config) {
      const records = [...(tableChanges.created ?? []), ...(tableChanges.updated ?? [])];
      for (const raw of records) {
        const fkVal = raw[fk];
        if (typeof fkVal === 'string' && fkVal !== '') {
          if (!parentIdsNeeded.has(parentTable)) {
            parentIdsNeeded.set(parentTable, new Set());
          }
          parentIdsNeeded.get(parentTable)!.add(fkVal);
        }
      }
    }
  }

  if (parentIdsNeeded.size === 0) return changes;

  // Look up server_ids for all needed parent records
  const wmIdToServerId = new Map<string, string>();

  for (const [parentTable, wmIds] of parentIdsNeeded) {
    const collection = database.get(parentTable);
    for (const wmId of wmIds) {
      try {
        const record = await collection.find(wmId);
        const serverId = (record._raw as Record<string, unknown>).server_id;
        if (typeof serverId === 'string' && serverId !== '') {
          wmIdToServerId.set(wmId, serverId);
        }
      } catch {
        // Record not found locally — may have been deleted
      }
    }
  }

  if (wmIdToServerId.size === 0) return changes;

  // Clone and remap
  const remapped = { ...changes };

  for (const [tableName, config] of Object.entries(FK_REMAP_CONFIG)) {
    const tableChanges = remapped[tableName];
    if (!tableChanges) continue;

    const remap = (records: Record<string, unknown>[]) =>
      records.map((raw) => {
        let modified = raw;
        for (const { fk } of config) {
          const fkVal = raw[fk];
          if (typeof fkVal === 'string' && wmIdToServerId.has(fkVal)) {
            if (modified === raw) modified = { ...raw };
            modified[fk] = wmIdToServerId.get(fkVal)!;
          }
        }
        return modified;
      });

    remapped[tableName] = {
      created: remap(tableChanges.created ?? []),
      updated: remap(tableChanges.updated ?? []),
      deleted: tableChanges.deleted ?? [],
    };
  }

  return remapped;
}

export async function performSync(database: Database): Promise<SyncResult> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('No auth token found. Please log in first.');
  }

  let conflictCount = 0;

  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt, schemaVersion }) => {
      const response = await fetch(`${API_URL}/sync/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ lastPulledAt, schemaVersion }),
      });

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status}`);
      }

      const { changes, timestamp } = await response.json();
      return { changes, timestamp };
    },
    pushChanges: async ({ changes, lastPulledAt }) => {
      // Remap FK fields to server UUIDs before pushing
      const remappedChanges = await remapForeignKeys(database, changes as any);

      const response = await fetch(`${API_URL}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ changes: remappedChanges, lastPulledAt }),
      });

      if (!response.ok) {
        throw new Error(`Push failed: ${response.status}`);
      }

      const body = await response.json();
      if (body.rejected?.length > 0) {
        conflictCount = body.rejected.length;
        console.warn('Sync conflicts (server wins):', body.rejected);
      }
    },
  });

  return { conflictCount };
}
