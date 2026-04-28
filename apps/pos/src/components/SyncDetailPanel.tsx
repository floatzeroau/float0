import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSync } from '../sync/SyncProvider';
import { SYNC_INTERVAL_MS } from '../config';
import { colors, spacing, radii, typography } from '../theme/tokens';

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
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
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
    borderRadius: radii.xs,
    marginRight: 6,
  },
  label: {
    fontSize: typography.size.md,
    color: '#6b7280',
  },
  value: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
  closeButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: radii.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  closeButtonText: {
    color: colors.textPrimary,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
});
