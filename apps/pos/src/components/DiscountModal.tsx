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
                placeholderTextColor="#999"
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
              {pinLoading && <ActivityIndicator style={styles.pinLoader} color="#1a1a1a" />}

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
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
  },

  // Type toggle
  typeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
  },
  toggleButton: {
    paddingHorizontal: 32,
    paddingVertical: 10,
  },
  toggleActive: {
    backgroundColor: '#1a1a1a',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
  },

  // Value display
  valueDisplay: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },

  // Preview
  preview: {
    width: '100%',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  previewRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 6,
    marginTop: 4,
    marginBottom: 0,
  },
  previewLabel: {
    fontSize: 13,
    color: '#666',
  },
  previewValue: {
    fontSize: 13,
    color: '#666',
  },
  previewLabelGreen: {
    fontSize: 13,
    color: '#16a34a',
  },
  previewValueGreen: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '600',
  },
  previewLabelBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  previewValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
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

  // Reason
  reasonInput: {
    width: '100%',
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1a1a1a',
    marginBottom: 12,
  },

  // Approval notice
  approvalNotice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f59e0b',
    marginBottom: 12,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  removeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.3,
  },
  applyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // PIN section
  pinSection: {
    alignItems: 'center',
    width: '100%',
  },
  pinTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
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
