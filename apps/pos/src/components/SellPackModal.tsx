import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { database } from '../db/database';
import type { Customer } from '../db/models';
import { API_URL, AUTH_TOKEN_KEY, STAFF_ID_KEY } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Pack {
  id: string;
  name: string;
  description: string | null;
  packSize: number;
  price: number;
  perItemValue: number;
  isActive: boolean;
  allowCustomSize: boolean;
}

interface SellPackModalProps {
  visible: boolean;
  customerId: string; // WatermelonDB ID
  customerName: string;
  onComplete: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// SellPackModal
// ---------------------------------------------------------------------------

export function SellPackModal({
  visible,
  customerId,
  customerName,
  onComplete,
  onCancel,
}: SellPackModalProps) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [selling, setSelling] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    setLoading(true);
    setPacks([]);
    setSelling(null);

    (async () => {
      try {
        const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        const res = await fetch(`${API_URL}/prepaid-packs`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setPacks(data.filter((p: Pack) => p.isActive));
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    })();
  }, [visible]);

  const handleSell = useCallback(
    async (pack: Pack) => {
      setSelling(pack.id);

      try {
        const cust = await database.get<Customer>('customers').find(customerId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const serverId = (cust._raw as any).server_id as string;
        const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        const staffId = await SecureStore.getItemAsync(STAFF_ID_KEY);

        const res = await fetch(`${API_URL}/customers/${serverId}/balances/purchase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            packId: pack.id,
            staffId: staffId ?? undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? 'Purchase failed');
        }

        Alert.alert(
          'Pack Sold',
          `${pack.name} (${pack.packSize} items) sold to ${customerName} for $${pack.price.toFixed(2)}.`,
          [{ text: 'OK', onPress: onComplete }],
        );
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to sell pack.');
        setSelling(null);
      }
    },
    [customerId, customerName, onComplete],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      supportedOrientations={['landscape-left', 'landscape-right']}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Sell Prepaid Pack</Text>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.customerLabel}>Customer: {customerName}</Text>

          {/* Pack list */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#999" />
            </View>
          ) : packs.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No active packs available</Text>
            </View>
          ) : (
            <ScrollView style={styles.packList} showsVerticalScrollIndicator={false}>
              {packs.map((pack) => {
                const savings = (pack.perItemValue * pack.packSize - pack.price).toFixed(2);
                const isSelling = selling === pack.id;

                return (
                  <View key={pack.id} style={styles.packCard}>
                    <View style={styles.packInfo}>
                      <Text style={styles.packName}>{pack.name}</Text>
                      {pack.description && (
                        <Text style={styles.packDescription} numberOfLines={1}>
                          {pack.description}
                        </Text>
                      )}
                      <View style={styles.packDetails}>
                        <Text style={styles.packDetail}>{pack.packSize} items</Text>
                        <Text style={styles.packDetailDot}> · </Text>
                        <Text style={styles.packDetail}>${pack.perItemValue.toFixed(2)}/item</Text>
                        {Number(savings) > 0 && (
                          <>
                            <Text style={styles.packDetailDot}> · </Text>
                            <Text style={styles.packSavings}>Save ${savings}</Text>
                          </>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.sellButton, isSelling && styles.sellButtonDisabled]}
                      onPress={() => handleSell(pack)}
                      disabled={selling !== null}
                    >
                      {isSelling ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.sellButtonText}>${pack.price.toFixed(2)}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  customerLabel: {
    fontSize: 13,
    color: '#888',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  packList: {
    maxHeight: 320,
  },
  packCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  packInfo: {
    flex: 1,
    marginRight: 12,
  },
  packName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  packDescription: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  packDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  packDetail: {
    fontSize: 12,
    color: '#666',
  },
  packDetailDot: {
    fontSize: 12,
    color: '#ccc',
  },
  packSavings: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
  },
  sellButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  sellButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sellButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
