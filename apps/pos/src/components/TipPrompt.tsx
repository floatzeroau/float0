import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

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

      <View style={styles.presetRow}>
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

      <TouchableOpacity
        style={styles.customButton}
        onPress={() => {
          setCustomInput('');
          setMode('custom');
        }}
      >
        <Text style={styles.customButtonText}>Custom Amount</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.noTipButton} onPress={() => onSelectTip(0)}>
        <Text style={styles.noTipButtonText}>No Tip</Text>
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
    padding: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  orderTotalLabel: {
    fontSize: 18,
    color: '#666',
    marginBottom: 40,
  },

  // Preset buttons
  presetRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  presetButton: {
    width: 160,
    height: 100,
    backgroundColor: '#2563eb',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetPercent: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  presetAmount: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },

  // Custom button
  customButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    marginBottom: 12,
  },
  customButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },

  // No tip button
  noTipButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  noTipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },

  // Custom mode
  customDisplay: {
    marginBottom: 24,
  },
  customAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#2563eb',
  },

  // Keypad
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    width: 296,
    marginBottom: 24,
  },
  keypadButton: {
    width: 88,
    height: 72,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keypadText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
  },

  // Custom actions
  customActions: {
    flexDirection: 'row',
    gap: 16,
  },
  confirmTipButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#10b981',
    borderRadius: 10,
  },
  confirmTipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  backButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
});
