import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, radii, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TipPromptProps {
  orderTotal: number;
  onSelectTip: (tipAmount: number) => void;
  onCancel: () => void;
}

const TIP_PERCENTAGES = [10, 15, 20] as const;

// ---------------------------------------------------------------------------
// TipPrompt
// ---------------------------------------------------------------------------

export function TipPrompt({ orderTotal, onSelectTip, onCancel }: TipPromptProps) {
  const [mode, setMode] = useState<'presets' | 'custom'>('presets');
  const [customInput, setCustomInput] = useState('');

  const customAmount = useMemo(() => {
    if (customInput === '') return 0;
    return parseFloat(customInput) / 100;
  }, [customInput]);

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;

  const handleKeyPress = useCallback((key: string) => {
    if (key === 'backspace') {
      setCustomInput((prev) => prev.slice(0, -1));
    } else {
      setCustomInput((prev) => {
        const next = prev + key;
        if (next.length > 7) return prev;
        return next;
      });
    }
  }, []);

  const handleConfirmCustom = useCallback(() => {
    onSelectTip(customAmount);
  }, [customAmount, onSelectTip]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (mode === 'custom') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Enter Custom Tip</Text>
        <Text style={styles.orderTotalLabel}>Order Total: {formatCurrency(orderTotal)}</Text>

        <View style={styles.customDisplay}>
          <Text style={styles.customAmount}>
            {customInput === '' ? '$0.00' : formatCurrency(customAmount)}
          </Text>
        </View>

        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', 'backspace'].map((key) => (
            <TouchableOpacity
              key={key}
              style={styles.keypadButton}
              onPress={() => handleKeyPress(key)}
            >
              <Text style={styles.keypadText}>{key === 'backspace' ? '\u232B' : key}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.customActions}>
          <TouchableOpacity style={styles.confirmTipButton} onPress={handleConfirmCustom}>
            <Text style={styles.confirmTipButtonText}>Confirm Tip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => setMode('presets')}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add a Tip?</Text>
      <Text style={styles.orderTotalLabel}>Order Total: {formatCurrency(orderTotal)}</Text>

      <View style={styles.mainRow}>
        {/* No Tip — prominent, left side */}
        <TouchableOpacity style={styles.noTipButton} onPress={() => onSelectTip(0)}>
          <Text style={styles.noTipButtonText}>No Tip</Text>
        </TouchableOpacity>

        {/* Tip percentages — right side */}
        <View style={styles.tipColumn}>
          {TIP_PERCENTAGES.map((pct) => {
            const tipValue = Math.round(orderTotal * pct) / 100;
            return (
              <TouchableOpacity
                key={pct}
                style={styles.presetButton}
                onPress={() => onSelectTip(tipValue)}
              >
                <Text style={styles.presetPercent}>{pct}%</Text>
                <Text style={styles.presetAmount}>({formatCurrency(tipValue)})</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity
        style={styles.customButton}
        onPress={() => {
          setCustomInput('');
          setMode('custom');
        }}
      >
        <Text style={styles.customButtonText}>Custom Amount</Text>
      </TouchableOpacity>
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
  title: {
    fontSize: typography.size['4xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  orderTotalLabel: {
    fontSize: typography.size.xl,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },

  // Main layout: No Tip on left, percentages on right
  mainRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  noTipButton: {
    width: 160,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.xl,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  noTipButtonText: {
    fontSize: 22,
    fontWeight: typography.weight.bold,
    color: '#374151',
  },
  tipColumn: {
    gap: 10,
  },
  presetButton: {
    width: 160,
    paddingVertical: 14,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetPercent: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  presetAmount: {
    fontSize: typography.size.md,
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.xxs,
  },

  // Custom button
  customButton: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
  },
  customButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },

  // Custom mode
  customDisplay: {
    marginBottom: spacing.xl,
  },
  customAmount: {
    fontSize: typography.size['5xl'],
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },

  // Keypad
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
    width: 296,
    marginBottom: spacing.xl,
  },
  keypadButton: {
    width: 88,
    height: 72,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadText: {
    fontSize: typography.size['4xl'],
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },

  // Custom actions
  customActions: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  confirmTipButton: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: 14,
    backgroundColor: colors.success,
    borderRadius: radii.lg,
  },
  confirmTipButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.white,
  },
  backButton: {
    paddingHorizontal: spacing.xxl,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
  },
  backButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
});
