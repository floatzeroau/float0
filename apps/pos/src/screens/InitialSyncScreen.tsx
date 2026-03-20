import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useDatabase } from '@nozbe/watermelondb/react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import {
  performInitialSync,
  resetInitialSync,
  type InitialSyncProgress,
} from '../sync/initial-sync';

const ENTITY_LABELS: Record<string, string> = {
  categories: 'categories',
  products: 'products',
  modifier_groups: 'modifier groups',
  modifiers: 'modifiers',
  product_modifier_groups: 'product modifiers',
  customers: 'customers',
  staff: 'staff members',
};

type Props = NativeStackScreenProps<RootStackParamList, 'InitialSync'>;

export default function InitialSyncScreen({ navigation }: Props) {
  const database = useDatabase();
  const [status, setStatus] = useState<'syncing' | 'complete' | 'error'>('syncing');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<InitialSyncProgress | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const startTime = useRef(Date.now());

  const overallProgress = progress
    ? (progress.entityIndex + (progress.total > 0 ? progress.synced / progress.total : 1)) /
      progress.entityCount
    : 0;

  const updateEta = useCallback((p: InitialSyncProgress) => {
    const elapsed = (Date.now() - startTime.current) / 1000;
    if (elapsed < 10) return;

    const fraction = (p.entityIndex + (p.total > 0 ? p.synced / p.total : 1)) / p.entityCount;
    if (fraction <= 0) return;

    const remaining = Math.max(0, elapsed / fraction - elapsed);
    if (remaining < 60) {
      setEta(`${Math.ceil(remaining)}s remaining`);
    } else {
      setEta(`${Math.ceil(remaining / 60)}m remaining`);
    }
  }, []);

  const startSync = useCallback(async () => {
    setStatus('syncing');
    setError('');
    setEta(null);
    setProgress(null);
    startTime.current = Date.now();

    try {
      await performInitialSync(database, (p) => {
        setProgress(p);
        updateEta(p);
      });
      setStatus('complete');
      setTimeout(() => navigation.replace('Main'), 500);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Sync failed');
    }
  }, [database, navigation, updateEta]);

  useEffect(() => {
    startSync();
  }, [startSync]);

  const handleRetry = () => {
    startSync();
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await resetInitialSync(database);
      setResetting(false);
      startSync();
    } catch {
      setResetting(false);
      setError('Failed to reset. Please restart the app.');
    }
  };

  const entityLabel = progress ? (ENTITY_LABELS[progress.entity] ?? progress.entity) : '';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Setting up your terminal...</Text>

      {status === 'syncing' && (
        <>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(overallProgress * 100)}%` as unknown as number },
              ]}
            />
          </View>

          {progress && progress.total > 0 ? (
            <Text style={styles.entityText}>
              Syncing {entityLabel}... {progress.synced}/{progress.total}
            </Text>
          ) : (
            <Text style={styles.entityText}>
              {entityLabel ? `Checking ${entityLabel}...` : 'Preparing...'}
            </Text>
          )}

          {eta && <Text style={styles.etaText}>{eta}</Text>}

          <ActivityIndicator style={styles.spinner} color="#1a1a1a" />
        </>
      )}

      {status === 'complete' && <Text style={styles.completeText}>Setup complete!</Text>}

      {status === 'error' && (
        <>
          <Text style={styles.errorText}>{error}</Text>

          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetButton} onPress={handleReset} disabled={resetting}>
            {resetting ? (
              <ActivityIndicator color="#dc2626" />
            ) : (
              <Text style={styles.resetButtonText}>Reset and Retry</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 40,
  },
  progressTrack: {
    width: '80%',
    maxWidth: 400,
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
  },
  entityText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 8,
  },
  etaText: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 16,
  },
  spinner: {
    marginTop: 16,
  },
  completeText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#22c55e',
  },
  errorText: {
    fontSize: 16,
    color: '#dc2626',
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  resetButton: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  resetButtonText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
});
