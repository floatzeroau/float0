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

interface PriceOverrideItemInfo {
  id: string;
  productName: string;
  unitPrice: number;
  lineTotal: number;
  quantity: number;
  modifiers: { id: string; name: string; priceAdjustment: number }[];
}

interface PriceOverrideModalProps {
  visible: boolean;
  item: PriceOverrideItemInfo | null;
  onConfirm: (newPrice: number, reason: string, managerApprover: string) => void;
  onCancel: () => void;
}

const PIN_LENGTH = 4;
const ORG_ID_KEY = 'float0_org_id';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PriceOverrideModal({
  visible,
  item,
  onConfirm,
  onCancel,
}: PriceOverrideModalProps) {
  // Price input state
  const [priceStr, setPriceStr] = useState('');
  const [reason, setReason] = useState('');

  // Manager PIN state (always required)
  const [needsPin, setNeedsPin] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinApproved, setPinApproved] = useState(false);
  const [approvedManagerId, setApprovedManagerId] = useState('');
  const shakeAnim = useState(() => new Animated.Value(0))[0];

  // Reset on open
  useEffect(() => {
    if (visible) {
      setPriceStr('');
      setReason('');
      setNeedsPin(false);
      setPin('');
      setPinError('');
      setPinLoading(false);
      setPinApproved(false);
      setApprovedManagerId('');
    }
  }, [visible]);

  const newPrice = parseFloat(priceStr) || 0;
  const hasValidPrice = newPrice > 0 && item != null && newPrice !== item.unitPrice;
  const canApply = hasValidPrice && reason.trim().length > 0 && pinApproved;

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

  // Keypad handler for price
  const handlePriceDigit = useCallback((digit: string) => {
    setPriceStr((prev) => {
      if (digit === '.' && prev.includes('.')) return prev;
      if (prev === '0' && digit !== '.') return digit;
      return prev + digit;
    });
  }, []);

  const handlePriceBackspace = useCallback(() => {
    setPriceStr((prev) => prev.slice(0, -1));
  }, []);

  // Keypad handler for PIN
  const handlePinDigit = useCallback(
    (digit: string) => {
      if (pin.length < PIN_LENGTH) {
        setPin((prev) => prev + digit);
        setPinError('');
      }
    },
    [pin.length],
  );

  const handlePinBackspace = useCallback(() => {
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

  const handleRequestApproval = useCallback(() => {
    if (hasValidPrice && reason.trim().length > 0) {
      setNeedsPin(true);
      setPin('');
      setPinError('');
    }
  }, [hasValidPrice, reason]);

  const handleConfirm = useCallback(() => {
    if (!canApply) return;
    onConfirm(newPrice, reason.trim(), approvedManagerId);
  }, [canApply, newPrice, reason, approvedManagerId, onConfirm]);

  if (!item) return null;

  const delta = newPrice > 0 ? newPrice - item.unitPrice : 0;
  const deltaStr =
    delta > 0 ? `+$${delta.toFixed(2)}` : delta < 0 ? `-$${Math.abs(delta).toFixed(2)}` : '';

  const priceDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '\u232B'];
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
          <Text style={styles.title}>Price Override</Text>
          <Text style={styles.itemName}>{item.productName}</Text>

          {!needsPin ? (
            <>
              {/* Current price */}
              <Text style={styles.currentPriceLabel}>Current Price</Text>
              <Text style={styles.currentPrice}>${item.unitPrice.toFixed(2)}</Text>

              {/* New price display */}
              <Text style={styles.newPriceLabel}>New Price</Text>
              <Text style={styles.newPriceDisplay}>${priceStr || '0.00'}</Text>

              {/* Preview */}
              {hasValidPrice && (
                <View style={styles.preview}>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>Original</Text>
                    <Text style={styles.previewValue}>${item.unitPrice.toFixed(2)}</Text>
                  </View>
                  <View style={styles.previewRow}>
                    <Text style={styles.previewLabel}>New</Text>
                    <Text style={styles.previewValueBlue}>${newPrice.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.previewRow, styles.previewRowBorder]}>
                    <Text style={styles.previewLabelBold}>Difference</Text>
                    <Text
                      style={[
                        styles.previewValueBold,
                        delta < 0 ? styles.textGreen : styles.textRed,
                      ]}
                    >
                      {deltaStr}
                    </Text>
                  </View>
                </View>
              )}

              {/* Keypad */}
              <View style={styles.keypad}>
                {priceDigits.map((d, i) => {
                  if (d === '') {
                    return <View key={i} style={styles.key} />;
                  }
                  const onPress = d === '\u232B' ? handlePriceBackspace : () => handlePriceDigit(d);
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
                placeholder="Reason for override (required)"
                placeholderTextColor="#999"
                value={reason}
                onChangeText={setReason}
              />

              {/* Approval notice */}
              {!pinApproved && <Text style={styles.approvalNotice}>Requires Manager Approval</Text>}
              {pinApproved && <Text style={styles.approvedNotice}>Manager Approved</Text>}

              {/* Footer */}
              <View style={styles.footer}>
                <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                {!pinApproved ? (
                  <TouchableOpacity
                    style={[
                      styles.applyButton,
                      (!hasValidPrice || reason.trim().length === 0) && styles.applyButtonDisabled,
                    ]}
                    onPress={handleRequestApproval}
                    disabled={!hasValidPrice || reason.trim().length === 0}
                  >
                    <Text style={styles.applyButtonText}>Approve</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.applyButton, !canApply && styles.applyButtonDisabled]}
                    onPress={handleConfirm}
                    disabled={!canApply}
                  >
                    <Text style={styles.applyButtonText}>Apply Override</Text>
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
                  const onPress = d === '\u232B' ? handlePinBackspace : () => handlePinDigit(d);
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
    marginBottom: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
  },

  // Current price
  currentPriceLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  currentPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },

  // New price
  newPriceLabel: {
    fontSize: 12,
    color: '#2563eb',
    marginBottom: 2,
  },
  newPriceDisplay: {
    fontSize: 36,
    fontWeight: '700',
    color: '#2563eb',
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
  previewValueBlue: {
    fontSize: 13,
    color: '#2563eb',
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
  },
  textGreen: {
    color: '#16a34a',
  },
  textRed: {
    color: '#dc2626',
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

  // Approval
  approvalNotice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f59e0b',
    marginBottom: 12,
  },
  approvedNotice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16a34a',
    marginBottom: 12,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
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
    backgroundColor: '#2563eb',
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
