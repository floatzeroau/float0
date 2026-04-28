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
import { ChevronRight, ArrowLeft } from 'lucide-react-native';
import { buildKitchenDocket } from '@float0/shared';
import type { DocketItemInput } from '@float0/shared';
import { database } from '../db/database';
import type { Customer } from '../db/models';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import { getPrinterService } from '../services';
import { colors, spacing, radii, typography } from '../theme/tokens';

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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      supportedOrientations={['landscape-left', 'landscape-right']}
    >
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
            <ActivityIndicator size="large" color={colors.pack} />
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
                  {isActive && <ChevronRight size={24} color={colors.textDisabled} />}
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          /* Quantity selection */
          <View style={styles.serveForm}>
            <TouchableOpacity style={styles.backToPacks} onPress={() => setSelectedPack(null)}>
              <ArrowLeft size={16} color={colors.primary} />
              <Text style={styles.backToPacksText}>Choose different pack</Text>
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
                <ActivityIndicator size="small" color={colors.white} />
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
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cancelButton: {
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
  },
  cancelButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.danger,
  },
  headerTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 60,
  },
  customerLabel: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.surfaceAlt,
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
    padding: spacing.xxxl,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textMuted,
  },
  listContent: {
    paddingBottom: 20,
  },

  // Pack row
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  packRowDisabled: {
    opacity: 0.5,
  },
  packInfo: {
    flex: 1,
  },
  packName: {
    fontSize: 15,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  packNameDisabled: {
    color: colors.textMuted,
  },
  packRemaining: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  expiredLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.danger,
    marginTop: spacing.xs,
  },

  // Serve form
  serveForm: {
    flex: 1,
    padding: spacing.lg,
  },
  backToPacks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  backToPacksText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  selectedPackCard: {
    backgroundColor: colors.packLight,
    padding: spacing.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9d5ff',
    marginBottom: spacing.xl,
  },
  selectedPackName: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  selectedPackRemaining: {
    fontSize: typography.size.md,
    color: colors.pack,
    marginTop: spacing.xs,
  },
  qtyLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  qtyButton: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  qtyInput: {
    width: 80,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  errorText: {
    fontSize: typography.size.sm,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  serveConfirmButton: {
    backgroundColor: colors.pack,
    paddingVertical: spacing.lg,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  serveConfirmDisabled: {
    backgroundColor: colors.textDisabled,
  },
  serveConfirmText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
});
