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
      const response = await fetch(`${API_URL}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ changes, lastPulledAt }),
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
