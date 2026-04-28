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
import { VOID_THRESHOLD_AMOUNT } from '../state/order-store';
import { API_URL } from '../config';
import { colors, spacing, radii, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoidItemInfo {
  id: string;
  productName: string;
  lineTotal: number;
  quantity: number;
}

interface VoidItemModalProps {
  visible: boolean;
  item: VoidItemInfo | null;
  onConfirm: (reason: string, managerApprover?: string) => void;
  onCancel: () => void;
}

const PIN_LENGTH = 4;
const ORG_ID_KEY = 'float0_org_id';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VoidItemModal({ visible, item, onConfirm, onCancel }: VoidItemModalProps) {
  const [reason, setReason] = useState('');

  // Manager PIN state
  const [needsPin, setNeedsPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinApproved, setPinApproved] = useState(false);
  const [approvedManagerId, setApprovedManagerId] = useState<string | undefined>();
  const shakeAnim = useState(() => new Animated.Value(0))[0];

  const requiresManagerPin = item ? item.lineTotal > VOID_THRESHOLD_AMOUNT : false;

  // Reset on open
  useEffect(() => {
    if (visible) {
      setReason('');
      setNeedsPin(false);
      setPin('');
      setPinError('');
      setPinLoading(false);
      setPinApproved(false);
      setApprovedManagerId(undefined);
    }
  }, [visible]);

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

  // Keypad handler for PIN
  const handleDigit = useCallback(
    (digit: string) => {
      if (pin.length < PIN_LENGTH) {
        setPin((prev) => prev + digit);
        setPinError('');
      }
    },
    [pin.length],
  );

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setPinError('');
  }, []);

  // Verify manager PIN
  const verifyPin = useCallback(async () => {
    if (pin.length < PIN_LENGTH || pinLoading) return;

    setPinLoading(true);
    setPinError('');

    try {
      const orgId = await SecureStore.getItemAsync(ORG_ID_KEY);
      if (!orgId) {
        setPinError('No organization configured');
        setPinLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/auth/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, pin }),
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        setPinApproved(true);
        setApprovedManagerId(body.staffId ?? 'manager');
        setNeedsPin(false);
        setPin('');
      } else {
        setPin('');
        shake();
        const body = await res.json().catch(() => ({}));
        setPinError(body.error ?? 'Invalid PIN');
      }
    } catch {
      setPin('');
      setPinError('Network error');
    } finally {
      setPinLoading(false);
    }
  }, [pin, pinLoading, shake]);

  // Auto-verify when PIN is complete
  useEffect(() => {
    if (needsPin && pin.length === PIN_LENGTH) {
      verifyPin();
    }
  }, [needsPin, pin.length, verifyPin]);

  const canConfirm = reason.trim().length > 0 && (!requiresManagerPin || pinApproved);

  const handleConfirm = useCallback(() => {
    if (!canConfirm) return;
    onConfirm(reason.trim(), approvedManagerId);
  }, [canConfirm, reason, approvedManagerId, onConfirm]);

  const handleRequestApproval = useCallback(() => {
    if (reason.trim().length > 0) {
      setNeedsPin(true);
      setPin('');
      setPinError('');
    }
  }, [reason]);

  if (!item) return null;

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
          {/* Header */}
          <Text style={styles.title}>Void Item</Text>
          <Text style={styles.itemName}>{item.productName}</Text>
          <Text style={styles.itemAmount}>${item.lineTotal.toFixed(2)}</Text>
          <Text style={styles.warning}>This action cannot be undone</Text>

          {!needsPin ? (
            <>
              {/* Reason input */}
              <TextInput
                style={styles.reasonInput}
                placeholder="Reason for voiding (required)"
                placeholderTextColor={colors.textMuted}
                value={reason}
                onChangeText={setReason}
              />

              {/* Manager approval notice */}
              {requiresManagerPin && !pinApproved && (
                <Text style={styles.approvalNotice}>Requires Manager Approval</Text>
              )}

              {pinApproved && <Text style={styles.approvedNotice}>Manager Approved</Text>}

              {/* Footer */}
              <View style={styles.footer}>
                <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                {requiresManagerPin && !pinApproved ? (
                  <TouchableOpacity
                    style={[
                      styles.voidButton,
                      reason.trim().length === 0 && styles.voidButtonDisabled,
                    ]}
                    onPress={handleRequestApproval}
                    disabled={reason.trim().length === 0}
                  >
                    <Text style={styles.voidButtonText}>Approve</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.voidButton, !canConfirm && styles.voidButtonDisabled]}
                    onPress={handleConfirm}
                    disabled={!canConfirm}
                  >
                    <Text style={styles.voidButtonText}>Void Item</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          ) : (
            /* Manager PIN entry */
            <View style={styles.pinSection}>
              <Text style={styles.pinTitle}>Manager PIN</Text>

              <Animated.View style={[styles.pinDots, { transform: [{ translateX: shakeAnim }] }]}>
                {Array.from({ length: PIN_LENGTH }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i < pin.length && styles.dotFilled,
                      pinError ? styles.dotError : null,
                    ]}
                  />
                ))}
              </Animated.View>

              {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}
              {pinLoading && (
                <ActivityIndicator style={styles.pinLoader} color={colors.textPrimary} />
              )}

              <View style={styles.keypad}>
                {pinDigits.map((d, i) => {
                  if (d === '') {
                    return <View key={i} style={styles.key} />;
                  }
                  const onPress = d === '\u232B' ? handleBackspace : () => handleDigit(d);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.key, pinLoading && styles.keyDisabled]}
                      onPress={onPress}
                      disabled={pinLoading}
                    >
                      <Text style={styles.keyText}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setNeedsPin(false);
                  setPin('');
                  setPinError('');
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
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  itemName: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  itemAmount: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  warning: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.danger,
    marginBottom: spacing.lg,
  },
  reasonInput: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.base,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  approvalNotice: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.warning,
    marginBottom: spacing.md,
  },
  approvedNotice: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.successDark,
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  voidButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  voidButtonDisabled: {
    opacity: 0.3,
  },
  voidButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.white,
  },

  // PIN section
  pinSection: {
    alignItems: 'center',
    width: '100%',
  },
  pinTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
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
});
