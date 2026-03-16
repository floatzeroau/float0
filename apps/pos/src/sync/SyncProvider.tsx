import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { SyncManager, type SyncState } from './sync-manager';
import { setSyncManager } from './payment-sync-hook';
import { database } from '../db/database';

interface SyncContextValue extends SyncState {
  syncNow: () => void;
}

const defaultValue: SyncContextValue = {
  isOnline: true,
  isSyncing: false,
  lastSyncTime: null,
  pendingCount: 0,
  priorityQueueCount: 0,
  conflictCount: 0,
  hasError: false,
  syncNow: () => {},
};

const SyncContext = createContext<SyncContextValue>(defaultValue);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SyncState>({
    isOnline: true,
    isSyncing: false,
    lastSyncTime: null,
    pendingCount: 0,
    priorityQueueCount: 0,
    conflictCount: 0,
    hasError: false,
  });
  const managerRef = useRef<SyncManager | null>(null);

  useEffect(() => {
    const manager = new SyncManager(database, setState);
    managerRef.current = manager;
    setSyncManager(manager);
    manager.start();

    return () => {
      manager.stop();
      managerRef.current = null;
      setSyncManager(null);
    };
  }, []);

  const syncNow = useCallback(() => {
    managerRef.current?.syncNow();
  }, []);

  return <SyncContext.Provider value={{ ...state, syncNow }}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  return useContext(SyncContext);
}
