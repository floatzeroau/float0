import type { Database } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { performSync } from './sync-service';
import { SYNC_INTERVAL_MS } from '../config';

const MAX_CONSECUTIVE_FAILURES = 5;
const PUSH_TABLES = ['orders', 'order_items', 'payments', 'shifts'];

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: number | null;
  pendingCount: number;
  hasError: boolean;
}

export class SyncManager {
  private database: Database;
  private onStateChange: (state: SyncState) => void;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private _isSyncing = false;
  private _isOnline = true;
  private _lastSyncTime: number | null = null;
  private _pendingCount = 0;
  private _consecutiveFailures = 0;
  private _hasError = false;

  constructor(database: Database, onStateChange: (state: SyncState) => void) {
    this.database = database;
    this.onStateChange = onStateChange;
  }

  start(): void {
    this.netInfoUnsubscribe = NetInfo.addEventListener(this.handleNetInfoChange);

    // Initial sync runs immediately
    this.syncNow();

    this.intervalId = setInterval(() => {
      this.syncNow();
    }, SYNC_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
  }

  async syncNow(): Promise<void> {
    if (this._isSyncing || !this._isOnline) return;

    this._isSyncing = true;
    this.emitState();

    try {
      await performSync(this.database);
      this._lastSyncTime = Date.now();
      this._consecutiveFailures = 0;
      this._hasError = false;
    } catch (err) {
      console.warn('Sync failed:', err);
      this._consecutiveFailures++;
      if (this._consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this._hasError = true;
      }
    } finally {
      this._isSyncing = false;
      await this.updatePendingCount();
      this.emitState();
    }
  }

  private handleNetInfoChange = (state: NetInfoState): void => {
    const wasOnline = this._isOnline;
    this._isOnline = state.isConnected ?? false;

    // Offline → online: trigger immediate sync
    if (!wasOnline && this._isOnline) {
      this.syncNow();
    }

    this.emitState();
  };

  private async updatePendingCount(): Promise<void> {
    try {
      let count = 0;
      for (const tableName of PUSH_TABLES) {
        const collection = this.database.get(tableName);
        const tableCount = await collection
          .query(Q.where('_status', Q.oneOf(['created', 'updated'])))
          .fetchCount();
        count += tableCount;
      }
      this._pendingCount = count;
    } catch {
      // Silently ignore — pendingCount stays at previous value
    }
  }

  private emitState(): void {
    this.onStateChange({
      isOnline: this._isOnline,
      isSyncing: this._isSyncing,
      lastSyncTime: this._lastSyncTime,
      pendingCount: this._pendingCount,
      hasError: this._hasError,
    });
  }
}
