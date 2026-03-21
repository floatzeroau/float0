import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useDatabase } from '@nozbe/watermelondb/react';
import type { Shift } from '../db/models';
import { getActiveShift } from '../db/queries';
import { STAFF_ID_KEY, STAFF_NAME_KEY } from '../config';

interface ShiftContextValue {
  currentShift: Shift | null;
  staffId: string | null;
  staffName: string | null;
  refreshShift: () => Promise<void>;
}

const defaultValue: ShiftContextValue = {
  currentShift: null,
  staffId: null,
  staffName: null,
  refreshShift: async () => {},
};

const ShiftContext = createContext<ShiftContextValue>(defaultValue);

export function ShiftProvider({ children }: { children: ReactNode }) {
  const database = useDatabase();
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string | null>(null);

  const refreshShift = useCallback(async () => {
    const id = await SecureStore.getItemAsync(STAFF_ID_KEY);
    const name = await SecureStore.getItemAsync(STAFF_NAME_KEY);
    setStaffId(id);
    setStaffName(name);
    if (id) {
      const shift = await getActiveShift(database, id);
      setCurrentShift(shift);
    }
  }, [database]);

  useEffect(() => {
    refreshShift();
  }, [refreshShift]);

  return (
    <ShiftContext.Provider value={{ currentShift, staffId, staffName, refreshShift }}>
      {children}
    </ShiftContext.Provider>
  );
}

export function useShift(): ShiftContextValue {
  return useContext(ShiftContext);
}
