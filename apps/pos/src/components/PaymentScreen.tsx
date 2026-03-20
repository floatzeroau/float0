import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { roundToFiveCents } from '@float0/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentScreenProps {
  visible: boolean;
  orderTotal: number;
  orderNumber: string;
  onComplete: (params: {
    method: 'cash';
    amount: number;
    tenderedAmount: number;
    changeGiven: number;
  }) => Promise<void>;
  onCancel: () => void;
}

type Phase = 'method' | 'cash';

const QUICK_TENDER_VALUES = [5, 10, 20, 50, 100];

// ---------------------------------------------------------------------------
// PaymentScreen
// ---------------------------------------------------------------------------

export function PaymentScreen({
  visible,
  orderTotal,
  orderNumber,
  onComplete,
  onCancel,
}: PaymentScreenProps) {
  const [phase, setPhase] = useState<Phase>('method');
  const [tenderedInput, setTenderedInput] = useState('');
  const [loading, setLoading] = useState(false);

  const roundedTotal = useMemo(() => roundToFiveCents(orderTotal), [orderTotal]);

  const tenderedAmount = useMemo(() => {
    if (tenderedInput === '') return 0;
    return parseFloat(tenderedInput) / 100;
  }, [tenderedInput]);

  const changeAmount = useMemo(
    () => Math.max(0, tenderedAmount - roundedTotal),
    [tenderedAmount, roundedTotal],
  );

  const isSufficient = tenderedAmount >= roundedTotal;

  const quickTenderOptions = useMemo(
    () => QUICK_TENDER_VALUES.filter((v) => v >= roundedTotal),
    [roundedTotal],
  );

  const handleReset = useCallback(() => {
    setPhase('method');
    setTenderedInput('');
    setLoading(false);
  }, []);

  const handleCancel = useCallback(() => {
    handleReset();
    onCancel();
  }, [handleReset, onCancel]);

  const handleCashSelect = useCallback(() => {
    setPhase('cash');
    setTenderedInput('');
  }, []);

  const handleKeyPress = useCallback((key: string) => {
    if (key === 'backspace') {
      setTenderedInput((prev) => prev.slice(0, -1));
    } else {
      setTenderedInput((prev) => {
        const next = prev + key;
        // Limit to reasonable amount (99999.99 = 9999999 cents)
        if (next.length > 7) return prev;
        return next;
      });
    }
  }, []);

  const handleQuickTender = useCallback((amount: number) => {
    // Convert dollar amount to cents string
    setTenderedInput(String(Math.round(amount * 100)));
  }, []);

  const handleExact = useCallback(() => {
    setTenderedInput(String(Math.round(roundedTotal * 100)));
  }, [roundedTotal]);

  const handleConfirm = useCallback(async () => {
    if (!isSufficient || loading) return;
    setLoading(true);
    try {
      await onComplete({
        method: 'cash',
        amount: roundedTotal,
        tenderedAmount,
        changeGiven: changeAmount,
      });
      handleReset();
    } catch {
      setLoading(false);
    }
  }, [isSufficient, loading, onComplete, roundedTotal, tenderedAmount, changeAmount, handleReset]);

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment — {orderNumber}</Text>
          <View style={styles.headerTotalContainer}>
            <Text style={styles.headerTotalLabel}>Total</Text>
            <Text style={styles.headerTotalValue}>{formatCurrency(roundedTotal)}</Text>
          </View>
        </View>

        {/* Phase 1: Method Selection */}
        {phase === 'method' && (
          <View style={styles.methodContainer}>
            <Text style={styles.methodTitle}>Select Payment Method</Text>
            <View style={styles.methodButtons}>
              <TouchableOpacity style={styles.cashMethodButton} onPress={handleCashSelect}>
                <Text style={styles.cashMethodIcon}>$</Text>
                <Text style={styles.cashMethodText}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cardMethodButton} disabled>
                <Text style={styles.cardMethodIcon}>Card</Text>
                <Text style={styles.cardMethodComingSoon}>Coming Soon</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Phase 2: Cash Entry */}
        {phase === 'cash' && (
          <View style={styles.cashContainer}>
            {/* Left side: amounts */}
            <View style={styles.cashLeft}>
              <View style={styles.amountSection}>
                <Text style={styles.amountLabel}>Order Total (rounded)</Text>
                <Text style={styles.amountTotal}>{formatCurrency(roundedTotal)}</Text>
              </View>

              <View style={styles.amountSection}>
                <Text style={styles.amountLabel}>Amount Tendered</Text>
                <Text style={styles.amountTendered}>
                  {tenderedInput === '' ? '$0.00' : formatCurrency(tenderedAmount)}
                </Text>
              </View>

              <View style={[styles.amountSection, styles.changeSection]}>
                <Text style={styles.amountLabel}>Change</Text>
                <Text style={[styles.amountChange, !isSufficient && styles.amountInsufficient]}>
                  {isSufficient ? formatCurrency(changeAmount) : 'Insufficient'}
                </Text>
              </View>

              {/* Quick tender buttons */}
              <View style={styles.quickTenderSection}>
                <Text style={styles.quickTenderLabel}>Quick Tender</Text>
                <View style={styles.quickTenderRow}>
                  <TouchableOpacity style={styles.quickTenderButton} onPress={handleExact}>
                    <Text style={styles.quickTenderText}>Exact</Text>
                  </TouchableOpacity>
                  {quickTenderOptions.map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={styles.quickTenderButton}
                      onPress={() => handleQuickTender(val)}
                    >
                      <Text style={styles.quickTenderText}>${val}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Confirm button */}
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  (!isSufficient || loading) && styles.confirmButtonDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!isSufficient || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>
                    {isSufficient ? 'Confirm Payment' : 'Insufficient Amount'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Right side: keypad */}
            <View style={styles.cashRight}>
              <View style={styles.keypad}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', 'backspace'].map(
                  (key) => (
                    <TouchableOpacity
                      key={key}
                      style={styles.keypadButton}
                      onPress={() => handleKeyPress(key)}
                    >
                      <Text style={styles.keypadText}>{key === 'backspace' ? '\u232B' : key}</Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginLeft: 16,
  },
  headerTotalContainer: {
    alignItems: 'flex-end',
  },
  headerTotalLabel: {
    fontSize: 12,
    color: '#999',
  },
  headerTotalValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  // Method selection
  methodContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  methodTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 40,
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 24,
  },
  cashMethodButton: {
    width: 200,
    height: 200,
    backgroundColor: '#10b981',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cashMethodIcon: {
    fontSize: 48,
    fontWeight: '700',
    color: '#fff',
  },
  cashMethodText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  cardMethodButton: {
    width: 200,
    height: 200,
    backgroundColor: '#e0e0e0',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMethodIcon: {
    fontSize: 24,
    fontWeight: '600',
    color: '#999',
  },
  cardMethodComingSoon: {
    fontSize: 12,
    color: '#bbb',
    marginTop: 4,
  },

  // Cash entry
  cashContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  cashLeft: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  cashRight: {
    width: 320,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
  },

  // Amount displays
  amountSection: {
    marginBottom: 20,
  },
  amountLabel: {
    fontSize: 14,
    color: '#999',
    marginBottom: 4,
  },
  amountTotal: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  amountTendered: {
    fontSize: 36,
    fontWeight: '700',
    color: '#2563eb',
  },
  changeSection: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  amountChange: {
    fontSize: 36,
    fontWeight: '700',
    color: '#10b981',
  },
  amountInsufficient: {
    fontSize: 24,
    color: '#ef4444',
  },

  // Quick tender
  quickTenderSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  quickTenderLabel: {
    fontSize: 14,
    color: '#999',
    marginBottom: 8,
  },
  quickTenderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickTenderButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  quickTenderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },

  // Confirm button
  confirmButton: {
    backgroundColor: '#10b981',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#ccc',
  },
  confirmButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },

  // Keypad
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
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
});
