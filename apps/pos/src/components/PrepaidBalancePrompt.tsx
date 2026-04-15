import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { database } from '../db/database';
import type { Customer } from '../db/models';
import { API_URL, AUTH_TOKEN_KEY } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Balance {
  id: string;
  packName: string;
  packId: string;
  remainingCount: number;
  originalCount: number;
  pricePaid: number;
  eligibleProductIds: string[] | null;
}

export interface PrepaidRedemption {
  balanceId: string;
  packName: string;
  quantity: number;
  perItemValue: number;
  amount: number;
}

interface PrepaidBalancePromptProps {
  customerId: string; // WatermelonDB ID
  orderTotal: number;
  onApply: (totalPrepaid: number, redemptions: PrepaidRedemption[]) => void;
  onSkip: () => void;
}

// ---------------------------------------------------------------------------
// PrepaidBalancePrompt
// ---------------------------------------------------------------------------

export function PrepaidBalancePrompt({
  customerId,
  orderTotal,
  onApply,
  onSkip,
}: PrepaidBalancePromptProps) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [selections, setSelections] = useState<Record<string, number>>({});

  // Fetch balances from engine API
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const cust = await database.get<Customer>('customers').find(customerId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const serverId = (cust._raw as any).server_id as string;
        const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);

        const res = await fetch(`${API_URL}/customers/${serverId}/balances`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (!cancelled) {
            setBalances([]);
            setLoading(false);
          }
          return;
        }

        const data = await res.json();
        if (!cancelled) {
          setBalances(data);
          setLoading(false);
          // Auto-skip if no balances
          if (data.length === 0) {
            onSkip();
          }
        }
      } catch {
        if (!cancelled) {
          setBalances([]);
          setLoading(false);
          onSkip();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerId, onSkip]);

  const toggleSelection = useCallback((balanceId: string, maxCount: number) => {
    setSelections((prev) => {
      const current = prev[balanceId] ?? 0;
      if (current > 0) {
        const next = { ...prev };
        delete next[balanceId];
        return next;
      }
      return { ...prev, [balanceId]: Math.min(1, maxCount) };
    });
  }, []);

  const adjustQuantity = useCallback((balanceId: string, delta: number, maxCount: number) => {
    setSelections((prev) => {
      const current = prev[balanceId] ?? 0;
      const next = Math.max(1, Math.min(current + delta, maxCount));
      return { ...prev, [balanceId]: next };
    });
  }, []);

  const totalPrepaidAmount = balances.reduce((sum, b) => {
    const qty = selections[b.id] ?? 0;
    if (qty === 0) return sum;
    const perItem = b.originalCount > 0 ? b.pricePaid / b.originalCount : 0;
    return sum + qty * perItem;
  }, 0);

  const handleApply = useCallback(async () => {
    const selected = balances.filter((b) => (selections[b.id] ?? 0) > 0);
    if (selected.length === 0) {
      onSkip();
      return;
    }

    setRedeeming(true);

    try {
      const cust = await database.get<Customer>('customers').find(customerId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serverId = (cust._raw as any).server_id as string;
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);

      const redemptions: PrepaidRedemption[] = [];

      for (const balance of selected) {
        const qty = selections[balance.id];
        const perItem = balance.originalCount > 0 ? balance.pricePaid / balance.originalCount : 0;

        const res = await fetch(`${API_URL}/customers/${serverId}/balances/redeem`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customerBalanceId: balance.id,
            quantity: qty,
          }),
        });

        if (!res.ok) {
          throw new Error('Redemption failed');
        }

        redemptions.push({
          balanceId: balance.id,
          packName: balance.packName,
          quantity: qty,
          perItemValue: perItem,
          amount: qty * perItem,
        });
      }

      const total = redemptions.reduce((s, r) => s + r.amount, 0);
      onApply(total, redemptions);
    } catch {
      setRedeeming(false);
    }
  }, [balances, selections, customerId, onApply, onSkip]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Checking prepaid balances...</Text>
      </View>
    );
  }

  const hasSelections = Object.values(selections).some((q) => q > 0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Prepaid Packs Available</Text>
      <Text style={styles.subtitle}>Order total: ${orderTotal.toFixed(2)}</Text>

      <ScrollView style={styles.balanceList} showsVerticalScrollIndicator={false}>
        {balances.map((b) => {
          const perItem = b.originalCount > 0 ? b.pricePaid / b.originalCount : 0;
          const selected = selections[b.id] ?? 0;
          const isSelected = selected > 0;

          return (
            <TouchableOpacity
              key={b.id}
              style={[styles.balanceCard, isSelected && styles.balanceCardSelected]}
              onPress={() => toggleSelection(b.id, b.remainingCount)}
              activeOpacity={0.7}
            >
              <View style={styles.balanceHeader}>
                <Text style={styles.balanceName}>{b.packName}</Text>
                <View style={styles.balanceCountBadge}>
                  <Text style={styles.balanceCountText}>
                    {b.remainingCount}/{b.originalCount}
                  </Text>
                </View>
              </View>

              <Text style={styles.balanceValue}>~${perItem.toFixed(2)} per item</Text>

              {isSelected && (
                <View style={styles.qtyRow}>
                  <Text style={styles.qtyLabel}>Redeem:</Text>
                  <TouchableOpacity
                    style={styles.qtyButton}
                    onPress={() => adjustQuantity(b.id, -1, b.remainingCount)}
                  >
                    <Text style={styles.qtyButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{selected}</Text>
                  <TouchableOpacity
                    style={styles.qtyButton}
                    onPress={() => adjustQuantity(b.id, 1, b.remainingCount)}
                  >
                    <Text style={styles.qtyButtonText}>+</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyAmount}>= ${(selected * perItem).toFixed(2)}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {hasSelections && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Prepaid total:</Text>
          <Text style={styles.summaryValue}>${totalPrepaidAmount.toFixed(2)}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.applyButton, (!hasSelections || redeeming) && styles.applyButtonDisabled]}
          onPress={handleApply}
          disabled={!hasSelections || redeeming}
        >
          {redeeming ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.applyButtonText}>
              {totalPrepaidAmount >= orderTotal
                ? 'Complete with Prepaid'
                : `Apply & Pay $${(orderTotal - totalPrepaidAmount).toFixed(2)} Remaining`}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={onSkip} disabled={redeeming}>
          <Text style={styles.skipButtonText}>Skip — Pay Full Amount</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  balanceList: {
    width: '100%',
    maxWidth: 500,
    maxHeight: 300,
  },
  balanceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  balanceCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  balanceCountBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  balanceCountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  balanceValue: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  qtyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  qtyValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2563eb',
    minWidth: 24,
    textAlign: 'center',
  },
  qtyAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
    marginLeft: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 500,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 4,
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
  },
  actions: {
    width: '100%',
    maxWidth: 500,
    marginTop: 16,
    gap: 12,
  },
  applyButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyButtonDisabled: {
    backgroundColor: '#ccc',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  skipButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
});
