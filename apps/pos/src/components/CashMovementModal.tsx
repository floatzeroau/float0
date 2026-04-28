import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { colors, spacing, radii, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Direction = 'in' | 'out';

interface CashMovementModalProps {
  visible: boolean;
  direction: Direction;
  onConfirm: (data: {
    direction: Direction;
    amount: number;
    reason: string;
    staffId: string;
    managerApproverId: string | null;
  }) => void;
  onCancel: () => void;
}

const PIN_LENGTH = 4;
const ORG_ID_KEY = 'float0_org_id';
const MANAGER_THRESHOLD_CENTS = 5000; // $50

const CASH_OUT_REASONS = ['Safe drop', 'Petty cash', 'Float adjustment', 'Other'] as const;
const CASH_IN_REASONS = ['Float top-up', 'Tips', 'Other'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CashMovementModal({
  visible,
  direction,
  onConfirm,
  onCancel,
}: CashMovementModalProps) {
  const [phase, setPhase] = useState<'amount' | 'reason' | 'manager_pin'>('amount');
  const [amountCents, setAmountCents] = useState(0);
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [staffId, setStaffId] = useState('');

  // Manager PIN state
  const [managerPin, setManagerPin] = useState('');
  const [managerPinError, setManagerPinError] = useState('');
  const [managerPinLoading, setManagerPinLoading] = useState(false);
  const shakeAnim = useState(() => new Animated.Value(0))[0];

  // Reset on open
  useEffect(() => {
    if (visible) {
      setPhase('amount');
      setAmountCents(0);
      setReason('');
      setOtherReason('');
      setManagerPin('');
      setManagerPinError('');
      setManagerPinLoading(false);
      SecureStore.getItemAsync('float0_staff_id').then((id) => setStaffId(id ?? ''));
    }
  }, [visible]);

  const needsManagerPin = direction === 'out' && amountCents > MANAGER_THRESHOLD_CENTS;
  const reasons = direction === 'out' ? CASH_OUT_REASONS : CASH_IN_REASONS;
  const displayAmount = `$${(amountCents / 100).toFixed(2)}`;

  // Amount keypad
  const handleDigit = (d: string) => {
    const next = amountCents * 10 + parseInt(d, 10);
    if (next <= 9999999) setAmountCents(next);
  };

  const handleBackspace = () => setAmountCents(Math.floor(amountCents / 10));
  const handleClear = () => setAmountCents(0);

  const handleAmountNext = () => {
    if (amountCents > 0) setPhase('reason');
  };

  // Reason selection
  const handleReasonSelect = (r: string) => {
    if (r === 'Other') {
      setReason('Other');
    } else {
      setReason(r);
      submitOrRequestPin(r);
    }
  };

  const handleOtherConfirm = () => {
    if (otherReason.trim().length > 0) {
      setReason(otherReason.trim());
      submitOrRequestPin(otherReason.trim());
    }
  };

  const submitOrRequestPin = (finalReason: string) => {
    if (needsManagerPin) {
      setPhase('manager_pin');
    } else {
      onConfirm({
        direction,
        amount: amountCents / 100,
        reason: finalReason,
        staffId,
        managerApproverId: null,
      });
    }
  };

  // Manager PIN
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
        const finalReason = reason === 'Other' ? otherReason.trim() : reason;
        onConfirm({
          direction,
          amount: amountCents / 100,
          reason: finalReason,
          staffId,
          managerApproverId: body.staffId ?? 'manager',
        });
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
  }, [
    managerPin,
    managerPinLoading,
    shake,
    reason,
    otherReason,
    direction,
    amountCents,
    staffId,
    onConfirm,
  ]);

  // Auto-verify when PIN is complete
  useEffect(() => {
    if (phase === 'manager_pin' && managerPin.length === PIN_LENGTH) {
      verifyManagerPin();
    }
  }, [phase, managerPin.length, verifyManagerPin]);

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '\u232B'];
  const pinDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '\u232B'];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      supportedOrientations={['landscape-left', 'landscape-right']}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>{direction === 'in' ? 'Cash In' : 'Cash Out'}</Text>

          {/* ── Amount phase ── */}
          {phase === 'amount' && (
            <>
              <Text style={styles.amount}>{displayAmount}</Text>

              <View style={styles.keypad}>
                {digits.map((d, i) => {
                  const onPress =
                    d === '\u232B'
                      ? handleBackspace
                      : d === 'C'
                        ? handleClear
                        : () => handleDigit(d);
                  return (
                    <TouchableOpacity key={i} style={styles.key} onPress={onPress}>
                      <Text style={styles.keyText}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.nextButton, amountCents === 0 && styles.nextButtonDisabled]}
                onPress={handleAmountNext}
                disabled={amountCents === 0}
              >
                <Text style={styles.nextButtonText}>Next</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Reason phase ── */}
          {phase === 'reason' && (
            <>
              <Text style={styles.subtitle}>{displayAmount}</Text>
              <Text style={styles.reasonTitle}>Select a reason</Text>

              {reasons.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.reasonButton,
                    reason === r && r === 'Other' && styles.reasonButtonActive,
                  ]}
                  onPress={() => handleReasonSelect(r)}
                >
                  <Text style={styles.reasonButtonText}>{r}</Text>
                </TouchableOpacity>
              ))}

              {reason === 'Other' && (
                <View style={styles.otherRow}>
                  <TextInput
                    style={styles.otherInput}
                    placeholder="Enter reason..."
                    placeholderTextColor={colors.textMuted}
                    value={otherReason}
                    onChangeText={setOtherReason}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[
                      styles.otherConfirm,
                      otherReason.trim().length === 0 && styles.otherConfirmDisabled,
                    ]}
                    onPress={handleOtherConfirm}
                    disabled={otherReason.trim().length === 0}
                  >
                    <Text style={styles.otherConfirmText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setPhase('amount');
                  setReason('');
                  setOtherReason('');
                }}
              >
                <Text style={styles.cancelButtonText}>Back</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Manager PIN phase ── */}
          {phase === 'manager_pin' && (
            <View style={styles.pinSection}>
              <Text style={styles.pinTitle}>Manager Approval Required</Text>
              <Text style={styles.subtitle}>Cash Out over $50 requires manager PIN</Text>

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
              {managerPinLoading && (
                <ActivityIndicator style={styles.pinLoader} color={colors.textPrimary} />
              )}

              <View style={styles.keypad}>
                {pinDigits.map((d, i) => {
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
                  setPhase('reason');
                  setManagerPin('');
                  setManagerPinError('');
                }}
              >
                <Text style={styles.cancelButtonText}>Back</Text>
              </TouchableOpacity>
            </View>
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
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: 360,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: typography.size.lg,
    color: '#6b7280',
    marginBottom: spacing.md,
  },
  amount: {
    fontSize: typography.size['5xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },

  // Keypad
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 240,
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  key: {
    width: 68,
    height: 52,
    margin: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyDisabled: {
    opacity: 0.3,
  },
  keyText: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.medium,
    color: colors.textPrimary,
  },

  // Next button
  nextButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: radii.md,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  nextButtonDisabled: {
    opacity: 0.3,
  },
  nextButtonText: {
    color: colors.white,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
  },

  // Reason
  reasonTitle: {
    fontSize: typography.size.base,
    color: '#4b5563',
    marginBottom: spacing.md,
  },
  reasonButton: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  reasonButtonActive: {
    backgroundColor: colors.border,
  },
  reasonButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },

  // Other reason
  otherRow: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  otherInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.base,
    color: colors.textPrimary,
  },
  otherConfirm: {
    paddingHorizontal: spacing.lg,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  otherConfirmDisabled: {
    opacity: 0.3,
  },
  otherConfirmText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.white,
  },

  // Cancel
  cancelButton: {
    width: '100%',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  cancelButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },

  // Manager PIN
  pinSection: {
    alignItems: 'center',
    width: '100%',
  },
  pinTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  pinDots: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.textMuted,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  dotError: {
    borderColor: colors.danger,
    backgroundColor: colors.danger,
  },
  pinErrorText: {
    color: colors.danger,
    fontSize: typography.size.md,
    marginBottom: spacing.sm,
  },
  pinLoader: {
    marginBottom: spacing.sm,
  },
});
