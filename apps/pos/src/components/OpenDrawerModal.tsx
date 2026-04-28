import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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

interface OpenDrawerModalProps {
  visible: boolean;
  onConfirm: (reason: string, staffId: string) => void;
  onCancel: () => void;
}

const PIN_LENGTH = 4;
const ORG_ID_KEY = 'float0_org_id';

const REASONS = ['Make Change', 'Check Float', 'Other'] as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpenDrawerModal({ visible, onConfirm, onCancel }: OpenDrawerModalProps) {
  const [phase, setPhase] = useState<'reason' | 'pin'>('reason');
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');

  // PIN state
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const shakeAnim = useState(() => new Animated.Value(0))[0];

  // Reset on open
  useEffect(() => {
    if (visible) {
      setPhase('reason');
      setReason('');
      setOtherReason('');
      setPin('');
      setPinError('');
      setPinLoading(false);
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

  const handleReasonSelect = useCallback((r: string) => {
    if (r === 'Other') {
      setReason('Other');
    } else {
      setReason(r);
      setPhase('pin');
    }
  }, []);

  const handleOtherConfirm = useCallback(() => {
    if (otherReason.trim().length > 0) {
      setReason(otherReason.trim());
      setPhase('pin');
    }
  }, [otherReason]);

  // Keypad handler
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

  // Verify PIN
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
        const finalReason = reason === 'Other' ? otherReason.trim() : reason;
        onConfirm(finalReason, body.staffId ?? 'staff');
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
  }, [pin, pinLoading, shake, reason, otherReason, onConfirm]);

  // Auto-verify when PIN is complete
  useEffect(() => {
    if (phase === 'pin' && pin.length === PIN_LENGTH) {
      verifyPin();
    }
  }, [phase, pin.length, verifyPin]);

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
          <Text style={styles.title}>Open Drawer</Text>

          {phase === 'reason' ? (
            <>
              <Text style={styles.subtitle}>Why are you opening the drawer?</Text>

              {REASONS.map((r) => (
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
                    <Text style={styles.otherConfirmText}>Next</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* PIN entry */
            <View style={styles.pinSection}>
              <Text style={styles.pinTitle}>Enter Staff PIN</Text>

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
                  setPhase('reason');
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
  subtitle: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },

  // Reason buttons
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

  // Other reason input
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
