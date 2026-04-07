import type { Database } from '@nozbe/watermelondb';
import { Q } from '@nozbe/watermelondb';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { performSync } from './sync-service';
import { SYNC_INTERVAL_MS } from '../config';

const MAX_CONSECUTIVE_FAILURES = 5;
const MAX_PRIORITY_RETRIES = 10;
const PUSH_TABLES = ['orders', 'order_items', 'payments', 'shifts', 'cash_movements'];
const PRIORITY_QUEUE_KEY = 'float0_priority_sync_queue';

export interface PriorityItem {
  table: string;
  id: string;
  queuedAt: number;
}

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: number | null;
  pendingCount: number;
  priorityQueueCount: number;
  conflictCount: number;
  hasError: boolean;
}

export class SyncManager {
  private database: Database;
  private onStateChange: (state: SyncState) => void;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private _priorityRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private _isSyncing = false;
  private _isOnline = true;
  private _lastSyncTime: number | null = null;
  private _pendingCount = 0;
  private _consecutiveFailures = 0;
  private _hasError = false;
  private _conflictCount = 0;
  private _priorityQueue: PriorityItem[] = [];
  private _priorityRetryCount = 0;

  constructor(database: Database, onStateChange: (state: SyncState) => void) {
    this.database = database;
    this.onStateChange = onStateChange;
  }

  // ── Lifecycle ────────────────────────────────────────

  start(): void {
    this.loadQueue().then(() => {
      this.emitState();
      this.netInfoUnsubscribe = NetInfo.addEventListener(this.handleNetInfoChange);

      this.intervalId = setInterval(() => {
        this.syncNow();
      }, SYNC_INTERVAL_MS);

      // If priority items persisted from a previous session, use priority sync
      if (this._priorityQueue.length > 0) {
        this._priorityRetryCount = 0;
        this.attemptPrioritySync();
      } else {
        this.syncNow();
      }
    });
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
    this.clearPriorityRetryTimer();
  }

  // ── Public API ───────────────────────────────────────

  async syncNow(): Promise<void> {
    const success = await this.executeSync();
    if (success) {
      await this.clearPriorityQueue();
    }
  }

  async syncPriority(records: { table: string; id: string }[]): Promise<void> {
    const items: PriorityItem[] = records.map((r) => ({
      ...r,
      queuedAt: Date.now(),
    }));
    this._priorityQueue.push(...items);
    await this.persistQueue();
    this.emitState();

    if (!this._isOnline) return;

    // Reset retry state for fresh attempt
    this._priorityRetryCount = 0;
    this.clearPriorityRetryTimer();
    this.attemptPrioritySync();
  }

  // ── Core sync ────────────────────────────────────────

  private async executeSync(): Promise<boolean> {
    if (this._isSyncing || !this._isOnline || this._hasError) return false;

    this._isSyncing = true;
    this.emitState();

    let success = false;
    try {
      const result = await performSync(this.database);
      this._lastSyncTime = Date.now();
      this._consecutiveFailures = 0;
      this._hasError = false;
      this._conflictCount = result.conflictCount;
      success = true;
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

    return success;
  }

  // ── Priority sync with backoff ───────────────────────

  private async attemptPrioritySync(): Promise<void> {
    if (this._priorityQueue.length === 0) return;
    if (!this._isOnline) return;

    const success = await this.executeSync();

    if (success) {
      await this.clearPriorityQueue();
      return;
    }

    // Failed or skipped — schedule retry with exponential backoff
    if (this._priorityRetryCount < MAX_PRIORITY_RETRIES) {
      const delay = Math.min(1000 * Math.pow(2, this._priorityRetryCount), 60_000);
      this._priorityRetryCount++;
      this._priorityRetryTimer = setTimeout(() => {
        this._priorityRetryTimer = null;
        this.attemptPrioritySync();
      }, delay);
    } else {
      console.error('Priority sync: gave up after', MAX_PRIORITY_RETRIES, 'retries');
    }
  }

  // ── Priority queue persistence ───────────────────────

  private async persistQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(PRIORITY_QUEUE_KEY, JSON.stringify(this._priorityQueue));
    } catch {
      // Silently ignore persistence failures
    }
  }

  private async loadQueue(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(PRIORITY_QUEUE_KEY);
      if (data) {
        this._priorityQueue = JSON.parse(data);
      }
    } catch {
      this._priorityQueue = [];
    }
  }

  private async clearPriorityQueue(): Promise<void> {
    if (this._priorityQueue.length === 0) return;
    this._priorityQueue = [];
    this._priorityRetryCount = 0;
    this.clearPriorityRetryTimer();
    await this.persistQueue();
    this.emitState();
  }

  private clearPriorityRetryTimer(): void {
    if (this._priorityRetryTimer) {
      clearTimeout(this._priorityRetryTimer);
      this._priorityRetryTimer = null;
    }
  }

  // ── Network ──────────────────────────────────────────

  private handleNetInfoChange = (state: NetInfoState): void => {
    const wasOnline = this._isOnline;
    this._isOnline = state.isConnected ?? false;

    if (!wasOnline && this._isOnline) {
      // Offline → online: priority items go first
      if (this._priorityQueue.length > 0) {
        this._priorityRetryCount = 0;
        this.attemptPrioritySync();
      } else {
        this.syncNow();
      }
    }

    this.emitState();
  };

  // ── Pending count ────────────────────────────────────

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

  // ── State emission ───────────────────────────────────

  private emitState(): void {
    this.onStateChange({
      isOnline: this._isOnline,
      isSyncing: this._isSyncing,
      lastSyncTime: this._lastSyncTime,
      pendingCount: this._pendingCount,
      priorityQueueCount: this._priorityQueue.length,
      conflictCount: this._conflictCount,
      hasError: this._hasError,
    });
  }
}
