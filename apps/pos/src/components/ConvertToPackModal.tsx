import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, Modal, StyleSheet } from 'react-native';
import type { CartItemData } from '../state/order-store';
import { colors, spacing, radii, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrgCafePackSettings {
  enabled: boolean;
  expiryMode: 'none' | 'fixed' | 'custom';
  expiryDays: number | null;
}

interface ConvertToPackModalProps {
  visible: boolean;
  item: CartItemData | null;
  cafePackSettings: OrgCafePackSettings;
  onConfirm: (
    itemId: string,
    packTotalQuantity: number,
    packPrice: number,
    packExpiryDate: string | null,
  ) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// ConvertToPackModal
// ---------------------------------------------------------------------------

export function ConvertToPackModal({
  visible,
  item,
  cafePackSettings,
  onConfirm,
  onCancel,
}: ConvertToPackModalProps) {
  const [quantity, setQuantity] = useState('10');
  const [priceInput, setPriceInput] = useState('');
  const [expiryInput, setExpiryInput] = useState('');

  // Calculate unit price including modifiers
  const unitPrice = useMemo(() => {
    if (!item) return 0;
    const modTotal = item.modifiers.reduce((sum, m) => sum + m.priceAdjustment, 0);
    return item.unitPrice + modTotal;
  }, [item]);

  // Reset when modal opens
  useEffect(() => {
    if (visible && item) {
      const defaultQty = 10;
      setQuantity(String(defaultQty));
      setPriceInput((unitPrice * defaultQty).toFixed(2));

      // Expiry
      const { expiryMode, expiryDays } = cafePackSettings;
      if (expiryMode === 'none') {
        setExpiryInput('');
      } else if (expiryMode === 'fixed' && expiryDays) {
        setExpiryInput(formatDate(addDays(new Date(), expiryDays)));
      } else if (expiryMode === 'custom' && expiryDays) {
        setExpiryInput(formatDate(addDays(new Date(), expiryDays)));
      } else {
        setExpiryInput('');
      }
    }
  }, [visible, item, unitPrice, cafePackSettings]);

  // Recalculate suggested price when quantity changes
  const handleQuantityChange = useCallback(
    (text: string) => {
      setQuantity(text);
      const qty = parseInt(text, 10);
      if (!isNaN(qty) && qty > 0) {
        setPriceInput((unitPrice * qty).toFixed(2));
      }
    },
    [unitPrice],
  );

  const parsedQuantity = parseInt(quantity, 10);
  const parsedPrice = parseFloat(priceInput);
  const isValid =
    !isNaN(parsedQuantity) && parsedQuantity >= 1 && !isNaN(parsedPrice) && parsedPrice >= 0;

  const savings = useMemo(() => {
    if (!isValid) return 0;
    return Math.max(0, unitPrice * parsedQuantity - parsedPrice);
  }, [unitPrice, parsedQuantity, parsedPrice, isValid]);

  const modifierText = item?.modifiers.map((m) => m.name).join(', ') ?? '';

  const handleConfirm = useCallback(() => {
    if (!item || !isValid) return;

    let expiryDate: string | null = null;
    if (cafePackSettings.expiryMode !== 'none' && expiryInput) {
      expiryDate = new Date(expiryInput + 'T23:59:59Z').toISOString();
    }

    onConfirm(item.id, parsedQuantity, parsedPrice, expiryDate);
  }, [item, isValid, parsedQuantity, parsedPrice, expiryInput, cafePackSettings, onConfirm]);

  if (!item) return null;

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
          <View style={styles.header}>
            <Text style={styles.title}>Convert to Cafe Pack</Text>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.productName}>
            {item.productName}
            {modifierText ? ` (${modifierText})` : ''}
          </Text>
          <Text style={styles.unitPriceLabel}>Unit price: ${unitPrice.toFixed(2)}</Text>

          {/* Quantity */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Quantity</Text>
            <TextInput
              style={styles.fieldInput}
              value={quantity}
              onChangeText={handleQuantityChange}
              keyboardType="number-pad"
              selectTextOnFocus
            />
          </View>

          {/* Price */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Pack Price ($)</Text>
            <TextInput
              style={styles.fieldInput}
              value={priceInput}
              onChangeText={setPriceInput}
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
          </View>

          {/* Expiry */}
          {cafePackSettings.expiryMode !== 'none' && (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Expiry Date</Text>
              <TextInput
                style={[
                  styles.fieldInput,
                  cafePackSettings.expiryMode === 'fixed' && styles.fieldInputReadOnly,
                ]}
                value={expiryInput}
                onChangeText={setExpiryInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textDisabled}
                editable={cafePackSettings.expiryMode === 'custom'}
              />
            </View>
          )}

          {/* Summary */}
          {isValid && (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>
                {parsedQuantity} × {item.productName}
                {modifierText ? `, ${modifierText}` : ''} = ${parsedPrice.toFixed(2)}
                {savings > 0 ? ` (save $${savings.toFixed(2)})` : ''}
              </Text>
            </View>
          )}

          {/* Confirm */}
          <TouchableOpacity
            style={[styles.confirmButton, !isValid && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!isValid}
          >
            <Text style={styles.confirmButtonText}>
              Confirm Pack — ${isValid ? parsedPrice.toFixed(2) : '0.00'}
            </Text>
          </TouchableOpacity>
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
    width: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  productName: {
    fontSize: 15,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xxs,
  },
  unitPriceLabel: {
    fontSize: typography.size.md,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: '#333',
    flex: 1,
  },
  fieldInput: {
    width: 140,
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  fieldInputReadOnly: {
    backgroundColor: colors.surfaceAlt,
    color: colors.textMuted,
  },
  summaryBox: {
    backgroundColor: '#f0f7ff',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: '#1a6ed8',
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: colors.success,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: colors.textDisabled,
  },
  confirmButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
});
