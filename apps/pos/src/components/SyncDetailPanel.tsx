import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSync } from '../sync/SyncProvider';
import { SYNC_INTERVAL_MS } from '../config';

interface SyncDetailPanelProps {
  visible: boolean;
  onClose: () => void;
}

function formatAbsoluteTime(timestamp: number | null): string {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleTimeString();
}

function formatCountdown(lastSyncTime: number | null): string {
  if (!lastSyncTime) return '--';
  const elapsed = Date.now() - lastSyncTime;
  const remaining = Math.max(0, SYNC_INTERVAL_MS - elapsed);
  return `${Math.ceil(remaining / 1000)}s`;
}

export function SyncDetailPanel({ visible, onClose }: SyncDetailPanelProps) {
  const {
    isOnline,
    isSyncing,
    lastSyncTime,
    pendingCount,
    priorityQueueCount,
    conflictCount,
    syncNow,
  } = useSync();
  const [, setTick] = useState(0);

  // Update countdown every second
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.panel}>
      <Row
        label="Connection"
        value={isOnline ? 'Connected' : 'Disconnected'}
        dot={isOnline ? '#22c55e' : '#ef4444'}
      />
      <Row label="Pending changes" value={String(pendingCount)} />
      <Row label="Priority queue" value={String(priorityQueueCount)} />
      <Row label="Conflicts" value={String(conflictCount)} />
      <Row label="Last sync" value={formatAbsoluteTime(lastSyncTime)} />
      <Row label="Next sync in" value={formatCountdown(lastSyncTime)} />

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, isSyncing && styles.buttonDisabled]}
          onPress={syncNow}
          disabled={isSyncing}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>{isSyncing ? 'Syncing...' : 'Sync Now'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Row({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  label: {
    fontSize: 13,
    color: '#6b7280',
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  closeButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '600',
  },
});
