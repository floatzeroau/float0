import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { database } from '../db/database';
import type { Shift } from '../db/models';
import { getActiveShift, getShiftCashTotal, getHeldOrderCount } from '../db/queries';
import { onShiftClosed } from '../sync/payment-sync-hook';
import { API_URL, STAFF_ID_KEY, STAFF_NAME_KEY, AUTH_TOKEN_KEY } from '../config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setRaw(record: any, field: string, value: string | number) {
  (record._raw as any)[field] = value;
}

const AUD_DENOMINATIONS = [
  { label: '$100', cents: 10000 },
  { label: '$50', cents: 5000 },
  { label: '$20', cents: 2000 },
  { label: '$10', cents: 1000 },
  { label: '$5', cents: 500 },
  { label: '$2', cents: 200 },
  { label: '$1', cents: 100 },
  { label: '50c', cents: 50 },
  { label: '20c', cents: 20 },
  { label: '10c', cents: 10 },
  { label: '5c', cents: 5 },
];

const BLIND_CLOSE = false; // configurable flag
const VARIANCE_THRESHOLD_DOLLARS = 5;
const PIN_LENGTH = 4;
const ORG_ID_KEY = 'float0_org_id';

type Props = NativeStackScreenProps<RootStackParamList, 'CloseShift'>;

type Phase = 'counting' | 'review' | 'manager_pin' | 'summary';

export default function CloseShiftScreen({ navigation }: Props) {
  // Shift data
  const [shift, setShift] = useState<Shift | null>(null);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [expectedCashDollars, setExpectedCashDollars] = useState(0);
  const [loading, setLoading] = useState(true);

  // Counting
  const [amountCents, setAmountCents] = useState(0);
  const [denomExpanded, setDenomExpanded] = useState(false);
  const [denomCounts, setDenomCounts] = useState<number[]>(() =>
    new Array(AUD_DENOMINATIONS.length).fill(0),
  );

  // Review
  const [phase, setPhase] = useState<Phase>('counting');
  const [varianceNotes, setVarianceNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Manager PIN
  const [managerPin, setManagerPin] = useState('');
  const [managerPinError, setManagerPinError] = useState('');
  const [managerPinLoading, setManagerPinLoading] = useState(false);
  const [managerApproverId, setManagerApproverId] = useState<string | null>(null);
  const shakeAnim = useState(() => new Animated.Value(0))[0];

  // Load shift data on mount
  useEffect(() => {
    (async () => {
      const staffId = await SecureStore.getItemAsync(STAFF_ID_KEY);
      const name = await SecureStore.getItemAsync(STAFF_NAME_KEY);
      setStaffName(name);

      if (!staffId) {
        Alert.alert('Error', 'No staff session found');
        navigation.goBack();
        return;
      }

      const activeShift = await getActiveShift(database, staffId);
      if (!activeShift) {
        Alert.alert('Error', 'No active shift found');
        navigation.goBack();
        return;
      }

      // Check for held orders
      const heldCount = await getHeldOrderCount(database);
      if (heldCount > 0) {
        Alert.alert(
          'Held Orders',
          `You have ${heldCount} held order${heldCount > 1 ? 's' : ''}. Please complete or cancel them before closing the shift.`,
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
        return;
      }

      setShift(activeShift);

      // Calculate expected cash: opening_float + cash sales during shift
      const openedAtMs = (activeShift._raw as any).opened_at as number;
      const cashTotal = await getShiftCashTotal(database, openedAtMs);
      setExpectedCashDollars(activeShift.openingFloat + cashTotal);
      setLoading(false);
    })();
  }, [navigation]);

  const actualDollars = amountCents / 100;
  const variance = actualDollars - expectedCashDollars;
  const absVariance = Math.abs(variance);
  const varianceColor =
    absVariance < 1 ? '#22c55e' : absVariance <= VARIANCE_THRESHOLD_DOLLARS ? '#f59e0b' : '#dc2626';
  const needsManagerApproval = absVariance > VARIANCE_THRESHOLD_DOLLARS && !managerApproverId;

  // Keypad
  const handleDigit = (d: string) => {
    if (denomExpanded) return;
    const next = amountCents * 10 + parseInt(d, 10);
    if (next <= 9999999) setAmountCents(next);
  };

  const handleBackspace = () => {
    if (denomExpanded) return;
    setAmountCents(Math.floor(amountCents / 10));
  };

  const handleClear = () => {
    if (denomExpanded) return;
    setAmountCents(0);
  };

  const updateDenomCount = (index: number, delta: number) => {
    setDenomCounts((prev) => {
      const next = [...prev];
      next[index] = Math.max(0, next[index] + delta);
      const total = next.reduce((sum, count, i) => sum + count * AUD_DENOMINATIONS[i].cents, 0);
      setAmountCents(total);
      return next;
    });
  };

  const denomTotal = denomCounts.reduce(
    (sum, count, i) => sum + count * AUD_DENOMINATIONS[i].cents,
    0,
  );

  const toggleDenom = () => {
    if (denomExpanded) {
      setDenomCounts(new Array(AUD_DENOMINATIONS.length).fill(0));
    }
    setDenomExpanded(!denomExpanded);
  };

  // Submit count → move to review
  const handleSubmitCount = () => {
    if (BLIND_CLOSE) {
      // In blind mode, reveal expected after count submission
      setPhase('review');
    } else {
      setPhase('review');
    }
  };

  // Manager PIN shake
  const shake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // Manager PIN verification
  const verifyManagerPin = useCallback(async () => {
    if (managerPin.length < PIN_LENGTH || managerPinLoading) return;

    setManagerPinLoading(true);
    setManagerPinError('');

    try {
      const orgId = await SecureStore.getItemAsync(ORG_ID_KEY);
      if (!orgId) {
        setManagerPinError('No organization configured');
        setManagerPinLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/auth/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, pin: managerPin }),
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        setManagerApproverId(body.staffId ?? 'manager');
        setPhase('review');
      } else {
        setManagerPin('');
        shake();
        const body = await res.json().catch(() => ({}));
        setManagerPinError(body.error ?? 'Invalid PIN');
      }
    } catch {
      setManagerPin('');
      setManagerPinError('Network error');
    } finally {
      setManagerPinLoading(false);
    }
  }, [managerPin, managerPinLoading, shake]);

  // Auto-verify manager PIN when complete
  useEffect(() => {
    if (phase === 'manager_pin' && managerPin.length === PIN_LENGTH) {
      verifyManagerPin();
    }
  }, [phase, managerPin.length, verifyManagerPin]);

  // Close shift
  const handleCloseShift = async () => {
    if (!shift || submitting) return;
    setSubmitting(true);

    try {
      const now = Date.now();
      await database.write(async () => {
        await shift.update(() => {
          setRaw(shift, 'closing_float', actualDollars);
          setRaw(shift, 'expected_cash', expectedCashDollars);
          setRaw(shift, 'actual_cash', actualDollars);
          setRaw(shift, 'variance', variance);
          if (varianceNotes.trim()) {
            setRaw(shift, 'variance_notes', varianceNotes.trim());
          }
          setRaw(shift, 'closed_at', now);
          setRaw(shift, 'status', 'closed');
          setRaw(shift, 'updated_at', now);
        });
      });

      // Priority sync the closed shift
      onShiftClosed(shift.id);

      setPhase('summary');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm close → handle manager approval if needed
  const handleConfirmClose = () => {
    if (needsManagerApproval) {
      setPhase('manager_pin');
    } else {
      handleCloseShift();
    }
  };

  // Return to login
  const handleDone = async () => {
    await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(STAFF_ID_KEY);
    await SecureStore.deleteItemAsync(STAFF_NAME_KEY);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a1a1a" />
      </View>
    );
  }

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '\u232B'];
  const managerPinDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '\u232B'];
  const displayAmount = `$${(amountCents / 100).toFixed(2)}`;

  // ── Summary phase ──────────────────────────────────────
  if (phase === 'summary') {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <Text style={styles.title}>Shift Closed</Text>
        {staffName ? <Text style={styles.welcome}>{staffName}</Text> : null}

        <View style={styles.summaryCard}>
          <SummaryRow label="Opening Float" value={`$${shift!.openingFloat.toFixed(2)}`} />
          <SummaryRow label="Expected Cash" value={`$${expectedCashDollars.toFixed(2)}`} />
          <SummaryRow label="Counted Cash" value={`$${actualDollars.toFixed(2)}`} />
          <View style={styles.summaryDivider} />
          <SummaryRow
            label="Variance"
            value={`${variance >= 0 ? '+' : ''}$${variance.toFixed(2)}`}
            valueColor={varianceColor}
          />
          {varianceNotes.trim() ? <SummaryRow label="Notes" value={varianceNotes.trim()} /> : null}
          {managerApproverId ? <SummaryRow label="Manager Approved" value="Yes" /> : null}
        </View>

        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Manager PIN phase ──────────────────────────────────
  if (phase === 'manager_pin') {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <Text style={styles.title}>Manager Approval Required</Text>
        <Text style={styles.subtitle}>
          Variance exceeds ${VARIANCE_THRESHOLD_DOLLARS.toFixed(2)}
        </Text>

        <Animated.View style={[styles.pinDots, { transform: [{ translateX: shakeAnim }] }]}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < managerPin.length && styles.dotFilled,
                managerPinError ? styles.dotError : null,
              ]}
            />
          ))}
        </Animated.View>

        {managerPinError ? <Text style={styles.pinErrorText}>{managerPinError}</Text> : null}
        {managerPinLoading && <ActivityIndicator style={styles.pinLoader} color="#1a1a1a" />}

        <View style={styles.grid}>
          {managerPinDigits.map((d, i) => {
            if (d === '') return <View key={i} style={styles.key} />;
            const onPress =
              d === '\u232B'
                ? () => {
                    setManagerPin((prev) => prev.slice(0, -1));
                    setManagerPinError('');
                  }
                : () => {
                    if (managerPin.length < PIN_LENGTH) {
                      setManagerPin((prev) => prev + d);
                      setManagerPinError('');
                    }
                  };
            return (
              <TouchableOpacity
                key={i}
                style={[styles.key, managerPinLoading && styles.keyDisabled]}
                onPress={onPress}
                disabled={managerPinLoading}
              >
                <Text style={styles.keyText}>{d}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => {
            setPhase('review');
            setManagerPin('');
            setManagerPinError('');
          }}
        >
          <Text style={styles.cancelButtonText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Review phase ───────────────────────────────────────
  if (phase === 'review') {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
        <Text style={styles.title}>Shift Reconciliation</Text>

        <View style={styles.summaryCard}>
          <SummaryRow label="Opening Float" value={`$${shift!.openingFloat.toFixed(2)}`} />
          <SummaryRow label="Expected Cash" value={`$${expectedCashDollars.toFixed(2)}`} />
          <SummaryRow label="Counted Cash" value={displayAmount} />
          <View style={styles.summaryDivider} />
          <SummaryRow
            label="Variance"
            value={`${variance >= 0 ? '+' : ''}$${variance.toFixed(2)}`}
            valueColor={varianceColor}
          />
        </View>

        {absVariance >= 1 && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>Variance Notes</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Explain the variance..."
              placeholderTextColor="#999"
              value={varianceNotes}
              onChangeText={setVarianceNotes}
              multiline
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.closeButton, submitting && styles.closeButtonDisabled]}
          onPress={handleConfirmClose}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.closeButtonText}>
              {needsManagerApproval ? 'Get Manager Approval' : 'Close Shift'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={() => setPhase('counting')}>
          <Text style={styles.cancelButtonText}>Re-count</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── Counting phase ─────────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
      <Text style={styles.title}>Close Shift</Text>
      {staffName ? <Text style={styles.welcome}>{staffName}</Text> : null}

      {!BLIND_CLOSE && (
        <Text style={styles.expectedHint}>Expected: ${expectedCashDollars.toFixed(2)}</Text>
      )}

      <Text style={styles.amount}>{displayAmount}</Text>

      <View style={styles.grid}>
        {digits.map((d, i) => {
          const onPress =
            d === '\u232B' ? handleBackspace : d === 'C' ? handleClear : () => handleDigit(d);
          const disabled = denomExpanded && d !== 'C';

          return (
            <TouchableOpacity
              key={i}
              style={[styles.key, disabled && styles.keyDisabled]}
              onPress={onPress}
              disabled={disabled}
            >
              <Text style={styles.keyText}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.denomToggle} onPress={toggleDenom}>
        <Text style={styles.denomToggleText}>
          {denomExpanded ? '\u25BC' : '\u25B6'} Count by denomination
        </Text>
      </TouchableOpacity>

      {denomExpanded && (
        <View style={styles.denomSection}>
          {AUD_DENOMINATIONS.map((denom, index) => (
            <View key={denom.label} style={styles.denomRow}>
              <Text style={styles.denomLabel}>{denom.label}</Text>
              <TouchableOpacity style={styles.denomBtn} onPress={() => updateDenomCount(index, -1)}>
                <Text style={styles.denomBtnText}>{'\u2212'}</Text>
              </TouchableOpacity>
              <Text style={styles.denomCount}>{denomCounts[index]}</Text>
              <TouchableOpacity style={styles.denomBtn} onPress={() => updateDenomCount(index, 1)}>
                <Text style={styles.denomBtnText}>+</Text>
              </TouchableOpacity>
              <Text style={styles.denomLineTotal}>
                ${((denomCounts[index] * denom.cents) / 100).toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={styles.denomTotalRow}>
            <Text style={styles.denomTotalLabel}>Total:</Text>
            <Text style={styles.denomTotalValue}>${(denomTotal / 100).toFixed(2)}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.closeButton} onPress={handleSubmitCount}>
        <Text style={styles.closeButtonText}>Submit Count</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Summary Row ────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
  },
  welcome: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
  },
  expectedHint: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 8,
  },
  amount: {
    fontSize: 48,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 270,
    justifyContent: 'center',
  },
  key: {
    width: 80,
    height: 80,
    margin: 5,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyDisabled: {
    opacity: 0.3,
  },
  keyText: {
    fontSize: 28,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  denomToggle: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  denomToggleText: {
    fontSize: 16,
    color: '#4b5563',
    fontWeight: '500',
  },
  denomSection: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  denomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  denomLabel: {
    width: 60,
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  denomBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  denomBtnText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  denomCount: {
    width: 40,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  denomLineTotal: {
    flex: 1,
    textAlign: 'right',
    fontSize: 16,
    color: '#6b7280',
  },
  denomTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    marginTop: 8,
    paddingTop: 12,
  },
  denomTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  denomTotalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  closeButton: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  closeButtonDisabled: {
    opacity: 0.3,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },

  // Summary card
  summaryCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginTop: 24,
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 8,
  },

  // Notes
  notesSection: {
    width: '100%',
    maxWidth: 400,
    marginTop: 16,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1a1a1a',
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Done
  doneButton: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  // Manager PIN
  pinDots: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    marginTop: 24,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#999',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
  },
  dotError: {
    borderColor: '#dc2626',
    backgroundColor: '#dc2626',
  },
  pinErrorText: {
    color: '#dc2626',
    fontSize: 14,
    marginBottom: 8,
  },
  pinLoader: {
    marginBottom: 8,
  },
});
