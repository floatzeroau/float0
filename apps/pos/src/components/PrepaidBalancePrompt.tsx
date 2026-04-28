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
import { colors, spacing, radii, typography } from '../theme/tokens';

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
        <ActivityIndicator size="large" color={colors.primary} />
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
            <ActivityIndicator color={colors.white} size="small" />
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
    padding: spacing.xxxl,
  },
  loadingText: {
    fontSize: typography.size.lg,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  title: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.size.lg,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  balanceList: {
    width: '100%',
    maxWidth: 500,
    maxHeight: 300,
  },
  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  balanceCardSelected: {
    borderColor: colors.primary,
    backgroundColor: '#eff6ff',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceName: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  balanceCountBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.lg,
  },
  balanceCountText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  balanceValue: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  qtyLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  qtyValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
    minWidth: 24,
    textAlign: 'center',
  },
  qtyAmount: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.success,
    marginLeft: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 500,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
  },
  summaryLabel: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  summaryValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.success,
  },
  actions: {
    width: '100%',
    maxWidth: 500,
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  applyButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  applyButtonDisabled: {
    backgroundColor: colors.textDisabled,
  },
  applyButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  skipButton: {
    paddingVertical: 14,
    borderRadius: radii.lg,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  skipButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
});
