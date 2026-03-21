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
    <Modal visible={visible} animationType="slide" transparent>
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
                    placeholderTextColor="#999"
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
              {managerPinLoading && <ActivityIndicator style={styles.pinLoader} color="#1a1a1a" />}

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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: 360,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 12,
  },
  amount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },

  // Keypad
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 240,
    justifyContent: 'center',
    marginBottom: 12,
  },
  key: {
    width: 68,
    height: 52,
    margin: 4,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyDisabled: {
    opacity: 0.3,
  },
  keyText: {
    fontSize: 22,
    fontWeight: '500',
    color: '#1a1a1a',
  },

  // Next button
  nextButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    marginBottom: 8,
  },
  nextButtonDisabled: {
    opacity: 0.3,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Reason
  reasonTitle: {
    fontSize: 15,
    color: '#4b5563',
    marginBottom: 12,
  },
  reasonButton: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginBottom: 8,
  },
  reasonButtonActive: {
    backgroundColor: '#e0e0e0',
  },
  reasonButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },

  // Other reason
  otherRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 8,
    marginBottom: 8,
  },
  otherInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1a1a1a',
  },
  otherConfirm: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  otherConfirmDisabled: {
    opacity: 0.3,
  },
  otherConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Cancel
  cancelButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    marginTop: 4,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },

  // Manager PIN
  pinSection: {
    alignItems: 'center',
    width: '100%',
  },
  pinTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  pinDots: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
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
    fontSize: 13,
    marginBottom: 8,
  },
  pinLoader: {
    marginBottom: 8,
  },
});
