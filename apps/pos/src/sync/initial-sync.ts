import type { Database } from '@nozbe/watermelondb';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import { schema } from '../db/schema';

const INITIAL_SYNC_COMPLETE_KEY = 'float0_initial_sync_complete';
const INITIAL_SYNC_PROGRESS_KEY = 'float0_initial_sync_progress';
const BATCH_SIZE = 50;

// Dependency order: parent entities first
const SYNC_ENTITIES = [
  'categories',
  'products',
  'modifier_groups',
  'modifiers',
  'product_modifier_groups',
  'customers',
  'staff',
] as const;

export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export interface InitialSyncProgress {
  entity: string;
  synced: number;
  total: number;
  entityIndex: number;
  entityCount: number;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export async function isInitialSyncComplete(): Promise<boolean> {
  const value = await AsyncStorage.getItem(INITIAL_SYNC_COMPLETE_KEY);
  return value === 'true';
}

export async function resetInitialSync(database: Database): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
  await AsyncStorage.multiRemove([INITIAL_SYNC_COMPLETE_KEY, INITIAL_SYNC_PROGRESS_KEY]);
}

// ---------------------------------------------------------------------------
// Per-entity progress tracking (survives force-quit)
// ---------------------------------------------------------------------------

async function getCompletedEntities(): Promise<Set<string>> {
  try {
    const data = await AsyncStorage.getItem(INITIAL_SYNC_PROGRESS_KEY);
    return data ? new Set(JSON.parse(data)) : new Set();
  } catch {
    return new Set();
  }
}

async function markEntityComplete(entity: string): Promise<void> {
  const completed = await getCompletedEntities();
  completed.add(entity);
  await AsyncStorage.setItem(INITIAL_SYNC_PROGRESS_KEY, JSON.stringify([...completed]));
}

// ---------------------------------------------------------------------------
// Bulk sync
// ---------------------------------------------------------------------------

export async function performInitialSync(
  database: Database,
  onProgress: (progress: InitialSyncProgress) => void,
): Promise<void> {
  const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
  const completedEntities = await getCompletedEntities();
  const entityCount = SYNC_ENTITIES.length;

  // Track the latest server timestamp so we can set WM's lastPulledAt
  let latestServerTimestamp = 0;

  for (let i = 0; i < entityCount; i++) {
    const entity = SYNC_ENTITIES[i];

    if (completedEntities.has(entity)) {
      onProgress({ entity, synced: 0, total: 0, entityIndex: i, entityCount });
      continue;
    }

    // Pull this entity from the server
    const response = await fetch(`${API_URL}/sync/pull`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        lastPulledAt: null,
        schemaVersion: schema.version,
        tables: [entity],
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to sync ${entity}: ${response.status}`);
    }

    const { changes, timestamp } = await response.json();

    // Keep the most recent server timestamp
    if (typeof timestamp === 'number' && timestamp > latestServerTimestamp) {
      latestServerTimestamp = timestamp;
    }

    const created: Record<string, unknown>[] = changes[entity]?.created ?? [];
    const total = created.length;

    if (total === 0) {
      onProgress({ entity, synced: 0, total: 0, entityIndex: i, entityCount });
      await markEntityComplete(entity);
      continue;
    }

    // Clear partial data from any previous interrupted attempt
    const collection = database.get(entity);
    const existing = await collection.query().fetch();
    if (existing.length > 0) {
      await database.write(async () => {
        await database.batch(...existing.map((r) => r.prepareDestroyPermanently()));
      });
    }

    // Batch-insert in chunks, reporting progress after each
    let synced = 0;

    for (let start = 0; start < total; start += BATCH_SIZE) {
      const chunk = created.slice(start, start + BATCH_SIZE);

      await database.write(async () => {
        await database.batch(...chunk.map((raw) => collection.prepareCreateFromDirtyRaw(raw)));
      });

      synced += chunk.length;
      onProgress({ entity, synced, total, entityIndex: i, entityCount });
    }

    await markEntityComplete(entity);
  }

  // Set WatermelonDB's internal lastPulledAt so the first synchronize() call
  // does an incremental sync instead of re-pulling everything.
  if (latestServerTimestamp > 0) {
    await database.adapter.setLocal('__watermelon_last_pulled_at', String(latestServerTimestamp));
  }

  // Clean up progress tracker and mark complete
  await AsyncStorage.multiRemove([INITIAL_SYNC_PROGRESS_KEY]);
  await AsyncStorage.setItem(INITIAL_SYNC_COMPLETE_KEY, 'true');
}
