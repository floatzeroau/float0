import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSync } from '../sync/SyncProvider';
import { SyncDetailPanel } from './SyncDetailPanel';

function formatRelativeTime(timestamp: number | null): string {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 30) return 'just now';
  if (seconds < 90) return '1 min ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SyncStatusBar() {
  const { isOnline, isSyncing, lastSyncTime, pendingCount, hasError } = useSync();
  const [detailVisible, setDetailVisible] = useState(false);
  const [, setTick] = useState(0);
  const spinValue = useRef(new Animated.Value(0)).current;

  // Refresh relative time every 30s
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Spin animation while syncing
  useEffect(() => {
    if (isSyncing) {
      spinValue.setValue(0);
      const loop = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
      return () => loop.stop();
    }
    spinValue.setValue(0);
  }, [isSyncing, spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const isWarning = pendingCount > 50 || hasError;

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setDetailVisible((v) => !v)}
        style={[styles.bar, isWarning && styles.barWarning]}
      >
        {/* Left: connection status */}
        <View style={styles.section}>
          <View style={[styles.dot, { backgroundColor: isOnline ? '#22c55e' : '#ef4444' }]} />
          <Text style={[styles.text, isWarning && styles.textWarning]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>

        {/* Center: last sync */}
        <Text style={[styles.text, styles.centerText, isWarning && styles.textWarning]}>
          Last sync: {formatRelativeTime(lastSyncTime)}
        </Text>

        {/* Right: pending badge / syncing indicator */}
        <View style={styles.section}>
          {isSyncing && (
            <Animated.Text style={[styles.syncIcon, { transform: [{ rotate: spin }] }]}>
              {'\u21BB'}
            </Animated.Text>
          )}
          {pendingCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {detailVisible && <SyncDetailPanel visible onClose={() => setDetailVisible(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  barWarning: {
    backgroundColor: '#fef3c7',
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 80,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  text: {
    fontSize: 13,
    color: '#1a1a1a',
  },
  textWarning: {
    color: '#92400e',
  },
  centerText: {
    flex: 1,
    textAlign: 'center',
  },
  syncIcon: {
    fontSize: 16,
    color: '#1a1a1a',
    marginRight: 6,
  },
  badge: {
    backgroundColor: '#f59e0b',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});
