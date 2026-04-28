import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { buildKitchenDocket } from '@float0/shared';
import type { DocketItemInput } from '@float0/shared';
import { database } from '../db/database';
import type { Customer } from '../db/models';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import { getPrinterService } from '../services';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PackData {
  id: string;
  productName: string;
  totalQuantity: number;
  remainingQuantity: number;
  expiryDate: string | null;
  status: string;
  productSnapshot?: {
    name: string;
    basePrice: number;
  };
}

interface ServeFromPackModalProps {
  visible: boolean;
  customerId: string; // WatermelonDB local ID or server ID
  customerName: string;
  isServerId?: boolean; // true when called from CustomersScreen (API ID)
  onComplete: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// ServeFromPackModal
// ---------------------------------------------------------------------------

export function ServeFromPackModal({
  visible,
  customerId,
  customerName,
  isServerId,
  onComplete,
  onCancel,
}: ServeFromPackModalProps) {
  const [packs, setPacks] = useState<PackData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPack, setSelectedPack] = useState<PackData | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [serving, setServing] = useState(false);
  const [resolvedServerId, setResolvedServerId] = useState<string | null>(null);

  // Fetch packs when modal opens
  useEffect(() => {
    if (!visible) {
      setSelectedPack(null);
      setQuantity('1');
      setPacks([]);
      setResolvedServerId(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        let serverId = customerId;
        if (!isServerId) {
          const cust = await database.get<Customer>('customers').find(customerId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          serverId = (cust._raw as any).server_id as string;
        }

        if (!cancelled) setResolvedServerId(serverId);

        const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        const res = await fetch(`${API_URL}/customers/${serverId}/packs`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setPacks(Array.isArray(data) ? data : (data.packs ?? []));
        }
      } catch {
        if (!cancelled) {
          Alert.alert('Error', 'Could not load packs. Please check your connection.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, customerId]);

  const handleSelectPack = useCallback((pack: PackData) => {
    setSelectedPack(pack);
    setQuantity('1');
  }, []);

  const handleServe = useCallback(async () => {
    if (!selectedPack || !resolvedServerId) return;

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) {
      Alert.alert('Invalid quantity', 'Please enter a valid quantity.');
      return;
    }

    if (qty > selectedPack.remainingQuantity) {
      Alert.alert(
        'Quantity too high',
        `Only ${selectedPack.remainingQuantity} remaining in this pack.`,
      );
      return;
    }

    setServing(true);

    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const res = await fetch(
        `${API_URL}/customers/${resolvedServerId}/packs/${selectedPack.id}/serve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ quantity: qty }),
        },
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }

      // Optional kitchen docket
      try {
        const docketItems: DocketItemInput[] = [
          {
            productName: selectedPack.productName,
            modifiers: [],
            quantity: qty,
            notes: `Pack serve for ${customerName}`,
            isVoided: false,
          },
        ];

        const docket = buildKitchenDocket(
          {
            orderNumber: `PACK-${selectedPack.id.slice(0, 6).toUpperCase()}`,
            orderType: 'takeaway',
            createdAt: Date.now(),
          },
          docketItems,
        );

        getPrinterService().printDocket(docket);
      } catch {
        // Docket print failure is non-critical
      }

      Alert.alert('Served', `${qty} × ${selectedPack.productName} served from pack.`);
      onComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      Alert.alert('Serve Failed', msg);
    } finally {
      setServing(false);
    }
  }, [selectedPack, quantity, resolvedServerId, customerName, onComplete]);

  const qtyNum = parseInt(quantity, 10);
  const isValidQty =
    !isNaN(qtyNum) &&
    qtyNum >= 1 &&
    selectedPack != null &&
    qtyNum <= selectedPack.remainingQuantity;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Serve from Pack</Text>
          <View style={styles.headerSpacer} />
        </View>

        <Text style={styles.customerLabel}>Customer: {customerName}</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#7c3aed" />
          </View>
        ) : packs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No packs found for this customer.</Text>
          </View>
        ) : !selectedPack ? (
          /* Pack list */
          <FlatList
            data={packs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item: pack }) => {
              const isExpired = pack.expiryDate && new Date(pack.expiryDate) < new Date();
              const isActive = pack.status === 'active' && !isExpired && pack.remainingQuantity > 0;

              return (
                <TouchableOpacity
                  style={[styles.packRow, !isActive && styles.packRowDisabled]}
                  onPress={() => isActive && handleSelectPack(pack)}
                  disabled={!isActive}
                >
                  <View style={styles.packInfo}>
                    <Text style={[styles.packName, !isActive && styles.packNameDisabled]}>
                      {pack.productName}
                    </Text>
                    <Text style={[styles.packRemaining, !isActive && styles.packNameDisabled]}>
                      {pack.remainingQuantity}/{pack.totalQuantity} remaining
                    </Text>
                    {isExpired && <Text style={styles.expiredLabel}>Expired</Text>}
                  </View>
                  {isActive && <Text style={styles.selectArrow}>›</Text>}
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          /* Quantity selection */
          <View style={styles.serveForm}>
            <TouchableOpacity style={styles.backToPacks} onPress={() => setSelectedPack(null)}>
              <Text style={styles.backToPacksText}>← Choose different pack</Text>
            </TouchableOpacity>

            <View style={styles.selectedPackCard}>
              <Text style={styles.selectedPackName}>{selectedPack.productName}</Text>
              <Text style={styles.selectedPackRemaining}>
                {selectedPack.remainingQuantity} remaining
              </Text>
            </View>

            <Text style={styles.qtyLabel}>Quantity to serve:</Text>
            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.qtyButton}
                onPress={() => {
                  const n = Math.max(1, qtyNum - 1);
                  setQuantity(String(n));
                }}
              >
                <Text style={styles.qtyButtonText}>−</Text>
              </TouchableOpacity>

              <TextInput
                style={styles.qtyInput}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
                textAlign="center"
                selectTextOnFocus
              />

              <TouchableOpacity
                style={styles.qtyButton}
                onPress={() => {
                  const n = Math.min(selectedPack.remainingQuantity, qtyNum + 1);
                  setQuantity(String(n));
                }}
              >
                <Text style={styles.qtyButtonText}>+</Text>
              </TouchableOpacity>
            </View>

            {qtyNum > selectedPack.remainingQuantity && (
              <Text style={styles.errorText}>Max {selectedPack.remainingQuantity} available</Text>
            )}

            <TouchableOpacity
              style={[styles.serveConfirmButton, !isValidQty && styles.serveConfirmDisabled]}
              onPress={handleServe}
              disabled={!isValidQty || serving}
            >
              {serving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.serveConfirmText}>
                  Serve {isValidQty ? qtyNum : ''} × {selectedPack.productName}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cancelButton: {
    paddingVertical: 4,
    paddingRight: 12,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerSpacer: {
    width: 60,
  },
  customerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  listContent: {
    paddingBottom: 20,
  },

  // Pack row
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  packRowDisabled: {
    opacity: 0.5,
  },
  packInfo: {
    flex: 1,
  },
  packName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  packNameDisabled: {
    color: '#999',
  },
  packRemaining: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  expiredLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
    marginTop: 4,
  },
  selectArrow: {
    fontSize: 24,
    color: '#ccc',
    marginLeft: 8,
  },

  // Serve form
  serveForm: {
    flex: 1,
    padding: 16,
  },
  backToPacks: {
    paddingVertical: 8,
    marginBottom: 12,
  },
  backToPacksText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  selectedPackCard: {
    backgroundColor: '#faf5ff',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9d5ff',
    marginBottom: 24,
  },
  selectedPackName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  selectedPackRemaining: {
    fontSize: 13,
    color: '#7c3aed',
    marginTop: 4,
  },
  qtyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  qtyButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  qtyInput: {
    width: 80,
    height: 48,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 12,
  },
  serveConfirmButton: {
    backgroundColor: '#7c3aed',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  serveConfirmDisabled: {
    backgroundColor: '#d1d5db',
  },
  serveConfirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
