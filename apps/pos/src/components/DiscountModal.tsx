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
import {
  calculateItemDiscount,
  calculateOrderDiscount,
  requiresManagerApproval,
} from '@float0/shared';
import type { DiscountType } from '@float0/shared';
import { API_URL } from '../config';
import { colors, spacing, radii, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExistingDiscount {
  type: DiscountType;
  value: number;
  reason: string;
}

interface DiscountModalProps {
  visible: boolean;
  mode: 'order' | 'item';
  itemName?: string;
  currentTotal: number;
  existingDiscount?: ExistingDiscount | null;
  onApply: (type: DiscountType, value: number, reason: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}

const PIN_LENGTH = 4;
const ORG_ID_KEY = 'float0_org_id';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiscountModal({
  visible,
  mode,
  itemName,
  currentTotal,
  existingDiscount,
  onApply,
  onRemove,
  onCancel,
}: DiscountModalProps) {
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [valueStr, setValueStr] = useState('');
  const [reason, setReason] = useState('');

  // Manager PIN state
  const [needsPin, setNeedsPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinApproved, setPinApproved] = useState(false);
  const shakeAnim = useState(() => new Animated.Value(0))[0];

  // Reset on open
  useEffect(() => {
    if (visible) {
      if (existingDiscount) {
        setDiscountType(existingDiscount.type);
        setValueStr(String(existingDiscount.value));
        setReason(existingDiscount.reason);
      } else {
        setDiscountType('percentage');
        setValueStr('');
        setReason('');
      }
      setNeedsPin(false);
      setPin('');
      setPinError('');
      setPinLoading(false);
      setPinApproved(false);
    }
  }, [visible, existingDiscount]);

  const numericValue = parseFloat(valueStr) || 0;

  // Calculate preview
  const discountAmount =
    mode === 'item'
      ? calculateItemDiscount(currentTotal, { type: discountType, value: numericValue })
      : calculateOrderDiscount(currentTotal, { type: discountType, value: numericValue });
  const newPrice = Math.max(0, currentTotal - discountAmount);

  const needsApproval =
    numericValue > 0 && requiresManagerApproval(discountType, numericValue) && !pinApproved;

  const canApply = numericValue > 0 && reason.trim().length > 0 && !needsApproval;

  // Keypad handlers
  const handleDigit = useCallback(
    (digit: string) => {
      if (needsPin) {
        if (pin.length < PIN_LENGTH) {
          setPin((prev) => prev + digit);
          setPinError('');
        }
        return;
      }
      setValueStr((prev) => {
        // Prevent multiple dots
        if (digit === '.' && prev.includes('.')) return prev;
        // Prevent leading zeros (except "0.")
        if (prev === '0' && digit !== '.') return digit;
        return prev + digit;
      });
    },
    [needsPin, pin.length],
  );

  const handleBackspace = useCallback(() => {
    if (needsPin) {
      setPin((prev) => prev.slice(0, -1));
      setPinError('');
      return;
    }
    setValueStr((prev) => prev.slice(0, -1));
  }, [needsPin]);

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
        setPinApproved(true);
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

  const handleApply = useCallback(() => {
    if (!canApply) return;
    onApply(discountType, numericValue, reason.trim());
  }, [canApply, discountType, numericValue, reason, onApply]);

  const handleRequestApproval = useCallback(() => {
    if (numericValue > 0 && reason.trim().length > 0) {
      setNeedsPin(true);
      setPin('');
      setPinError('');
    }
  }, [numericValue, reason]);

  const title = mode === 'order' ? 'Order Discount' : `Item Discount: ${itemName ?? ''}`;

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '\u232B'];
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
          <Text style={styles.title}>{title}</Text>

          {!needsPin ? (
            <>
              {/* Type toggle */}
              <View style={styles.typeToggle}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    discountType === 'percentage' && styles.toggleActive,
                  ]}
                  onPress={() => setDiscountType('percentage')}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      discountType === 'percentage' && styles.toggleTextActive,
                    ]}
                  >
                    %
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, discountType === 'fixed' && styles.toggleActive]}
                  onPress={() => setDiscountType('fixed')}
                >
                  <Text
                    style={[styles.toggleText, discountType === 'fixed' && styles.toggleTextActive]}
                  >
                    $
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Value display */}
              <Text style={styles.valueDisplay}>
                {discountType === 'percentage' ? `${valueStr || '0'}%` : `$${valueStr || '0'}`}
              </Text>

              {/* Preview */}
              {numericValue > 0 && (
                <View style={styles.preview}>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Original</Text>
                    <Text style={styles.previewValue}>${currentTotal.toFixed(2)}</Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabelGreen}>Discount</Text>
                    <Text style={styles.previewValueGreen}>-${discountAmount.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.previewRow, styles.previewRowBorder]}>
                    <Text style={styles.previewLabelBold}>New Price</Text>
                    <Text style={styles.previewValueBold}>${newPrice.toFixed(2)}</Text>
                  </View>
                </View>
              )}

              {/* Keypad */}
              <View style={styles.keypad}>
                {digits.map((d, i) => {
                  if (d === '') {
                    return <View key={i} style={styles.key} />;
                  }
                  const onPress = d === '\u232B' ? handleBackspace : () => handleDigit(d);
                  return (
                    <TouchableOpacity key={i} style={styles.key} onPress={onPress}>
                      <Text style={styles.keyText}>{d}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Reason */}
              <TextInput
                style={styles.reasonInput}
                placeholder="Reason for discount (required)"
                placeholderTextColor={colors.textMuted}
                value={reason}
                onChangeText={setReason}
              />

              {/* Manager approval notice */}
              {numericValue > 0 &&
                requiresManagerApproval(discountType, numericValue) &&
                !pinApproved && (
                  <Text style={styles.approvalNotice}>Requires Manager Approval</Text>
                )}

              {/* Footer */}
              <View style={styles.footer}>
                {existingDiscount && (
                  <TouchableOpacity style={styles.removeButton} onPress={onRemove}>
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                {needsApproval ? (
                  <TouchableOpacity
                    style={[
                      styles.applyButton,
                      reason.trim().length === 0 && styles.applyButtonDisabled,
                    ]}
                    onPress={handleRequestApproval}
                    disabled={reason.trim().length === 0}
                  >
                    <Text style={styles.applyButtonText}>Approve</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.applyButton, !canApply && styles.applyButtonDisabled]}
                    onPress={handleApply}
                    disabled={!canApply}
                  >
                    <Text style={styles.applyButtonText}>Apply</Text>
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
    marginBottom: spacing.lg,
    textAlign: 'center',
  },

  // Type toggle
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radii.md,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  toggleButton: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: 10,
  },
  toggleActive: {
    backgroundColor: colors.textPrimary,
  },
  toggleText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.white,
  },

  // Value display
  valueDisplay: {
    fontSize: typography.size['5xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  // Preview
  preview: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  previewRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
    marginTop: spacing.xs,
    marginBottom: 0,
  },
  previewLabel: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
  },
  previewValue: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
  },
  previewLabelGreen: {
    fontSize: typography.size.md,
    color: colors.successDark,
  },
  previewValueGreen: {
    fontSize: typography.size.md,
    color: colors.successDark,
    fontWeight: typography.weight.semibold,
  },
  previewLabelBold: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  previewValueBold: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
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

  // Reason
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

  // Approval notice
  approvalNotice: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.warning,
    marginBottom: spacing.md,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  removeButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.danger,
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
  applyButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.3,
  },
  applyButtonText: {
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
});
