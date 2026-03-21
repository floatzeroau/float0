import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { calculatePaymentTotal } from '@float0/shared';
import type { CompletePaymentParams } from '../state/order-store';
import { getTerminalService } from '../services';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SplitPaymentFlowProps {
  orderTotal: number;
  orderNumber: string;
  tipAmount: number;
  onRecordPartialPayment: (params: CompletePaymentParams) => Promise<void>;
  onComplete: (params: CompletePaymentParams) => Promise<void>;
  onCancel: () => void;
}

type SplitMode = 'by_method' | 'evenly';

type SplitPhase =
  | 'setup'
  | 'portion_method'
  | 'portion_cash'
  | 'portion_card'
  | 'portion_card_error';

interface Portion {
  amount: number;
  tip: number;
}

const MAX_SPLITS = 4;
const QUICK_TENDER_VALUES = [5, 10, 20, 50, 100];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function distributeTip(portions: Portion[], totalTip: number, orderTotal: number): Portion[] {
  if (totalTip === 0) return portions;

  let tipSum = 0;
  const result = portions.map((p, i) => {
    if (i === portions.length - 1) {
      // Last portion absorbs rounding remainder
      const tip = Math.round((totalTip - tipSum) * 100) / 100;
      return { ...p, tip };
    }
    const tip = Math.round((p.amount / orderTotal) * totalTip * 100) / 100;
    tipSum += tip;
    return { ...p, tip };
  });
  return result;
}

function buildEvenPortions(total: number, count: number, totalTip: number): Portion[] {
  const perPerson = Math.floor((total / count) * 100) / 100;
  const portions: Portion[] = [];
  let remaining = total;
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      // First person absorbs remainder cents
      const firstAmount = Math.round((total - perPerson * (count - 1)) * 100) / 100;
      portions.push({ amount: firstAmount, tip: 0 });
      remaining -= firstAmount;
    } else {
      portions.push({ amount: perPerson, tip: 0 });
      remaining -= perPerson;
    }
  }
  return distributeTip(portions, totalTip, total);
}

// ---------------------------------------------------------------------------
// SplitPaymentFlow
// ---------------------------------------------------------------------------

export function SplitPaymentFlow({
  orderTotal,
  orderNumber,
  tipAmount,
  onRecordPartialPayment,
  onComplete,
  onCancel,
}: SplitPaymentFlowProps) {
  const [phase, setPhase] = useState<SplitPhase>('setup');
  const [splitMode, setSplitMode] = useState<SplitMode | null>(null);

  // By-method state
  const [methodAmounts, setMethodAmounts] = useState<number[]>([0]);
  const [amountInput, setAmountInput] = useState('');
  const [editingIndex, setEditingIndex] = useState(0);

  // Even split state
  const [evenCount, setEvenCount] = useState(2);

  // Processing state
  const [portions, setPortions] = useState<Portion[]>([]);
  const [currentPortionIndex, setCurrentPortionIndex] = useState(0);
  const [paidTotal, setPaidTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cardError, setCardError] = useState('');

  // Cash UI state for portion
  const [tenderedInput, setTenderedInput] = useState('');

  const totalWithTip = orderTotal + tipAmount;
  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;

  // ---------------------------------------------------------------------------
  // Setup — By Method
  // ---------------------------------------------------------------------------

  const methodRemaining = useMemo(() => {
    const sum = methodAmounts.reduce((s, a) => s + a, 0);
    return Math.round((orderTotal - sum) * 100) / 100;
  }, [methodAmounts, orderTotal]);

  const handleAmountKeyPress = useCallback((key: string) => {
    if (key === 'backspace') {
      setAmountInput((prev) => prev.slice(0, -1));
    } else {
      setAmountInput((prev) => {
        const next = prev + key;
        if (next.length > 7) return prev;
        return next;
      });
    }
  }, []);

  const currentInputAmount = useMemo(() => {
    if (amountInput === '') return 0;
    return parseFloat(amountInput) / 100;
  }, [amountInput]);

  const handleSetPortionAmount = useCallback(() => {
    if (currentInputAmount <= 0) return;
    if (currentInputAmount > orderTotal) return;

    setMethodAmounts((prev) => {
      const updated = [...prev];
      updated[editingIndex] = currentInputAmount;
      return updated;
    });
    setAmountInput('');
  }, [currentInputAmount, editingIndex, orderTotal]);

  const handleAddSplit = useCallback(() => {
    if (methodAmounts.length >= MAX_SPLITS) return;
    setMethodAmounts((prev) => [...prev, 0]);
    setEditingIndex(methodAmounts.length);
    setAmountInput('');
  }, [methodAmounts.length]);

  const handleRemoveSplit = useCallback(
    (index: number) => {
      if (methodAmounts.length <= 1) return;
      setMethodAmounts((prev) => prev.filter((_, i) => i !== index));
      setEditingIndex(0);
      setAmountInput('');
    },
    [methodAmounts.length],
  );

  const canConfirmMethodSplit = useMemo(() => {
    // All amounts must be > 0 and sum to orderTotal
    const allPositive = methodAmounts.every((a) => a > 0);
    return allPositive && Math.abs(methodRemaining) < 0.01;
  }, [methodAmounts, methodRemaining]);

  const handleConfirmMethodSplit = useCallback(() => {
    if (!canConfirmMethodSplit) return;
    const rawPortions = methodAmounts.map((amount) => ({ amount, tip: 0 }));
    const withTip = distributeTip(rawPortions, tipAmount, orderTotal);
    setPortions(withTip);
    setCurrentPortionIndex(0);
    setPaidTotal(0);
    setPhase('portion_method');
  }, [canConfirmMethodSplit, methodAmounts, tipAmount, orderTotal]);

  // ---------------------------------------------------------------------------
  // Setup — Evenly
  // ---------------------------------------------------------------------------

  const handleConfirmEvenSplit = useCallback(() => {
    const evenPortions = buildEvenPortions(orderTotal, evenCount, tipAmount);
    setPortions(evenPortions);
    setCurrentPortionIndex(0);
    setPaidTotal(0);
    setPhase('portion_method');
  }, [orderTotal, evenCount, tipAmount]);

  // ---------------------------------------------------------------------------
  // Processing — Method selection for current portion
  // ---------------------------------------------------------------------------

  const currentPortion = portions[currentPortionIndex] ?? { amount: 0, tip: 0 };
  const portionTotal = currentPortion.amount + currentPortion.tip;
  const remainingToPay = Math.round((totalWithTip - paidTotal) * 100) / 100;

  const handlePortionCash = useCallback(() => {
    setTenderedInput('');
    setPhase('portion_cash');
  }, []);

  const handlePortionCard = useCallback(() => {
    setPhase('portion_card');
    setCardError('');
  }, []);

  // ---------------------------------------------------------------------------
  // Cash portion
  // ---------------------------------------------------------------------------

  const portionCashPayment = useMemo(
    () => calculatePaymentTotal(portionTotal, 'cash'),
    [portionTotal],
  );

  const tenderedAmount = useMemo(() => {
    if (tenderedInput === '') return 0;
    return parseFloat(tenderedInput) / 100;
  }, [tenderedInput]);

  const changeAmount = useMemo(
    () => Math.max(0, tenderedAmount - portionCashPayment.payableAmount),
    [tenderedAmount, portionCashPayment.payableAmount],
  );

  const isSufficient = tenderedAmount >= portionCashPayment.payableAmount;

  const quickTenderOptions = useMemo(
    () => QUICK_TENDER_VALUES.filter((v) => v >= portionCashPayment.payableAmount),
    [portionCashPayment.payableAmount],
  );

  const handleCashKeyPress = useCallback((key: string) => {
    if (key === 'backspace') {
      setTenderedInput((prev) => prev.slice(0, -1));
    } else {
      setTenderedInput((prev) => {
        const next = prev + key;
        if (next.length > 7) return prev;
        return next;
      });
    }
  }, []);

  const handleQuickTender = useCallback((amount: number) => {
    setTenderedInput(String(Math.round(amount * 100)));
  }, []);

  const handleExact = useCallback(() => {
    setTenderedInput(String(Math.round(portionCashPayment.payableAmount * 100)));
  }, [portionCashPayment.payableAmount]);

  const advanceToNextPortion = useCallback(
    (paidAmount: number) => {
      const newPaidTotal = Math.round((paidTotal + paidAmount) * 100) / 100;
      setPaidTotal(newPaidTotal);
      setCurrentPortionIndex((prev) => prev + 1);
      setPhase('portion_method');
    },
    [paidTotal],
  );

  const handleCashConfirm = useCallback(async () => {
    if (!isSufficient || loading) return;
    setLoading(true);

    const params: CompletePaymentParams = {
      method: 'cash',
      amount: portionCashPayment.payableAmount,
      tipAmount: currentPortion.tip,
      tenderedAmount,
      changeGiven: changeAmount,
      roundingAmount: portionCashPayment.roundingAmount,
    };

    try {
      const isLast = currentPortionIndex === portions.length - 1;
      if (isLast) {
        await onComplete(params);
      } else {
        await onRecordPartialPayment(params);
        advanceToNextPortion(portionTotal);
      }
    } catch {
      // stay on current screen
    } finally {
      setLoading(false);
    }
  }, [
    isSufficient,
    loading,
    portionCashPayment,
    currentPortion.tip,
    tenderedAmount,
    changeAmount,
    currentPortionIndex,
    portions.length,
    onComplete,
    onRecordPartialPayment,
    advanceToNextPortion,
    portionTotal,
  ]);

  // ---------------------------------------------------------------------------
  // Card portion
  // ---------------------------------------------------------------------------

  const portionCardPayment = useMemo(
    () => calculatePaymentTotal(portionTotal, 'card'),
    [portionTotal],
  );

  const processCardPortion = useCallback(async () => {
    setPhase('portion_card');
    setCardError('');

    const amountToCharge = portionCardPayment.payableAmount;
    const terminal = getTerminalService();
    try {
      const result = await terminal.sendPayment(amountToCharge);
      if (result.success) {
        setLoading(true);
        const params: CompletePaymentParams = {
          method: 'card',
          amount: amountToCharge,
          tipAmount: currentPortion.tip,
          approvalCode: result.approvalCode ?? '',
          cardType: result.cardType ?? '',
          lastFour: result.lastFour ?? '',
        };

        const isLast = currentPortionIndex === portions.length - 1;
        if (isLast) {
          await onComplete(params);
        } else {
          await onRecordPartialPayment(params);
          advanceToNextPortion(portionTotal);
        }
        setLoading(false);
      } else {
        setCardError(result.errorMessage ?? 'Payment declined');
        setPhase('portion_card_error');
      }
    } catch {
      setCardError('Terminal communication error');
      setPhase('portion_card_error');
    }
  }, [
    portionCardPayment.payableAmount,
    currentPortion.tip,
    currentPortionIndex,
    portions.length,
    onComplete,
    onRecordPartialPayment,
    advanceToNextPortion,
    portionTotal,
  ]);

  // Start card processing when entering portion_card phase
  const handleStartCard = useCallback(() => {
    processCardPortion();
  }, [processCardPortion]);

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  const handleCancelSplit = useCallback(() => {
    if (paidTotal > 0) {
      Alert.alert(
        'Cancel Split Payment?',
        `${formatCurrency(paidTotal)} has already been paid. Those payments will be kept. The order will remain open for payment later.`,
        [
          { text: 'Continue Paying', style: 'cancel' },
          { text: 'Stop Here', style: 'destructive', onPress: onCancel },
        ],
      );
    } else {
      onCancel();
    }
  }, [paidTotal, onCancel]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const formatRounding = (val: number) => {
    if (val === 0) return '$0.00';
    const sign = val > 0 ? '+' : '-';
    return `${sign}$${Math.abs(val).toFixed(2)}`;
  };

  return (
    <View style={styles.container}>
      {/* Progress header — shown during processing */}
      {phase !== 'setup' && (
        <View style={styles.progressHeader}>
          <Text style={styles.progressTitle}>
            Payment {currentPortionIndex + 1} of {portions.length} — {orderNumber}
          </Text>
          <Text style={styles.progressDetail}>
            Paid: {formatCurrency(paidTotal)} / {formatCurrency(totalWithTip)}
            {'  '}Remaining: {formatCurrency(remainingToPay)}
          </Text>
        </View>
      )}

      {/* Setup phase */}
      {phase === 'setup' && (
        <View style={styles.setupContainer}>
          <Text style={styles.setupTitle}>Split Payment — {formatCurrency(totalWithTip)}</Text>
          {tipAmount > 0 && (
            <Text style={styles.setupTipNote}>(includes {formatCurrency(tipAmount)} tip)</Text>
          )}

          {!splitMode && (
            <View style={styles.modeButtons}>
              <TouchableOpacity
                style={styles.modeButton}
                onPress={() => {
                  setSplitMode('by_method');
                  setMethodAmounts([0]);
                  setAmountInput('');
                  setEditingIndex(0);
                }}
              >
                <Text style={styles.modeButtonIcon}>$$</Text>
                <Text style={styles.modeButtonText}>Split by Amount</Text>
                <Text style={styles.modeButtonSub}>Enter custom amounts</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modeButton} onPress={() => setSplitMode('evenly')}>
                <Text style={styles.modeButtonIcon}>÷</Text>
                <Text style={styles.modeButtonText}>Split Evenly</Text>
                <Text style={styles.modeButtonSub}>Divide among people</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* By method setup */}
          {splitMode === 'by_method' && (
            <View style={styles.methodSetupContainer}>
              <View style={styles.methodSetupLeft}>
                {/* Portion list */}
                <View style={styles.portionList}>
                  {methodAmounts.map((amt, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.portionRow, editingIndex === i && styles.portionRowActive]}
                      onPress={() => {
                        setEditingIndex(i);
                        setAmountInput(amt > 0 ? String(Math.round(amt * 100)) : '');
                      }}
                    >
                      <Text style={styles.portionLabel}>Portion {i + 1}</Text>
                      <Text style={styles.portionAmount}>
                        {amt > 0 ? formatCurrency(amt) : '—'}
                      </Text>
                      {methodAmounts.length > 1 && (
                        <TouchableOpacity
                          style={styles.portionRemove}
                          onPress={() => handleRemoveSplit(i)}
                        >
                          <Text style={styles.portionRemoveText}>×</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.remainingLabel}>
                  Remaining: {formatCurrency(methodRemaining)}
                </Text>

                {methodAmounts.length < MAX_SPLITS && (
                  <TouchableOpacity style={styles.addSplitButton} onPress={handleAddSplit}>
                    <Text style={styles.addSplitText}>+ Add Another Split</Text>
                  </TouchableOpacity>
                )}

                {/* Set amount button */}
                <TouchableOpacity
                  style={[styles.setAmountButton, currentInputAmount <= 0 && styles.buttonDisabled]}
                  onPress={handleSetPortionAmount}
                  disabled={currentInputAmount <= 0}
                >
                  <Text style={styles.setAmountText}>
                    Set Portion {editingIndex + 1}:{' '}
                    {amountInput ? formatCurrency(currentInputAmount) : '$0.00'}
                  </Text>
                </TouchableOpacity>

                {/* Auto-fill remaining */}
                {methodRemaining > 0 && (
                  <TouchableOpacity
                    style={styles.fillRemainingButton}
                    onPress={() => {
                      setAmountInput(String(Math.round(methodRemaining * 100)));
                    }}
                  >
                    <Text style={styles.fillRemainingText}>
                      Fill Remaining ({formatCurrency(methodRemaining)})
                    </Text>
                  </TouchableOpacity>
                )}

                <View style={styles.setupActions}>
                  <TouchableOpacity style={styles.cancelButton} onPress={() => setSplitMode(null)}>
                    <Text style={styles.cancelButtonText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, !canConfirmMethodSplit && styles.buttonDisabled]}
                    onPress={handleConfirmMethodSplit}
                    disabled={!canConfirmMethodSplit}
                  >
                    <Text style={styles.confirmButtonText}>Start Payments</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Keypad */}
              <View style={styles.setupKeypad}>
                <View style={styles.keypad}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', 'backspace'].map(
                    (key) => (
                      <TouchableOpacity
                        key={key}
                        style={styles.keypadButton}
                        onPress={() => handleAmountKeyPress(key)}
                      >
                        <Text style={styles.keypadText}>
                          {key === 'backspace' ? '\u232B' : key}
                        </Text>
                      </TouchableOpacity>
                    ),
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Even split setup */}
          {splitMode === 'evenly' && (
            <View style={styles.evenSetupContainer}>
              <Text style={styles.evenLabel}>Number of people:</Text>
              <View style={styles.evenButtons}>
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.evenButton, evenCount === n && styles.evenButtonActive]}
                    onPress={() => setEvenCount(n)}
                  >
                    <Text
                      style={[
                        styles.evenButtonText,
                        evenCount === n && styles.evenButtonTextActive,
                      ]}
                    >
                      {n}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.evenPerPerson}>
                {formatCurrency(Math.floor((orderTotal / evenCount) * 100) / 100)} per person
                {tipAmount > 0 &&
                  ` + ~${formatCurrency(Math.round((tipAmount / evenCount) * 100) / 100)} tip`}
              </Text>
              <View style={styles.setupActions}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setSplitMode(null)}>
                  <Text style={styles.cancelButtonText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmEvenSplit}>
                  <Text style={styles.confirmButtonText}>Start Payments</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Cancel at setup level */}
          {!splitMode && (
            <TouchableOpacity style={styles.setupCancelButton} onPress={onCancel}>
              <Text style={styles.setupCancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Portion method selection */}
      {phase === 'portion_method' && (
        <View style={styles.portionMethodContainer}>
          <Text style={styles.portionMethodTitle}>
            Portion {currentPortionIndex + 1}: {formatCurrency(portionTotal)}
          </Text>
          {currentPortion.tip > 0 && (
            <Text style={styles.portionTipNote}>
              ({formatCurrency(currentPortion.amount)} + {formatCurrency(currentPortion.tip)} tip)
            </Text>
          )}
          <View style={styles.methodButtons}>
            <TouchableOpacity style={styles.cashMethodButton} onPress={handlePortionCash}>
              <Text style={styles.cashMethodIcon}>$</Text>
              <Text style={styles.cashMethodText}>Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cardMethodButton} onPress={handleStartCard}>
              <Text style={styles.cardMethodIcon}>Card</Text>
              <Text style={styles.cardMethodSubtext}>EFTPOS</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.portionCancelButton} onPress={handleCancelSplit}>
            <Text style={styles.portionCancelText}>Cancel Split</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Cash portion */}
      {phase === 'portion_cash' && (
        <View style={styles.cashContainer}>
          <View style={styles.cashLeft}>
            <View style={styles.amountSection}>
              <Text style={styles.amountLabel}>Portion Amount</Text>
              <Text style={styles.amountTotal}>{formatCurrency(portionTotal)}</Text>
              {currentPortion.tip > 0 && (
                <Text style={styles.tipLine}>
                  Includes {formatCurrency(currentPortion.tip)} tip
                </Text>
              )}
              {portionCashPayment.roundingAmount !== 0 && (
                <View style={styles.roundingRow}>
                  <Text style={styles.roundingText}>
                    Rounding: {formatRounding(portionCashPayment.roundingAmount)}
                  </Text>
                  <Text style={styles.roundingArrow}>
                    {' '}
                    Cash: {formatCurrency(portionCashPayment.payableAmount)}
                  </Text>
                </View>
              )}
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

            {/* Quick tender */}
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

            <View style={styles.cashActions}>
              <TouchableOpacity
                style={styles.cashBackButton}
                onPress={() => setPhase('portion_method')}
              >
                <Text style={styles.cashBackText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, (!isSufficient || loading) && styles.buttonDisabled]}
                onPress={handleCashConfirm}
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
          </View>

          {/* Keypad */}
          <View style={styles.cashRight}>
            <View style={styles.keypad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', 'backspace'].map((key) => (
                <TouchableOpacity
                  key={key}
                  style={styles.keypadButton}
                  onPress={() => handleCashKeyPress(key)}
                >
                  <Text style={styles.keypadText}>{key === 'backspace' ? '\u232B' : key}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Card portion — processing */}
      {phase === 'portion_card' && (
        <View style={styles.cardProcessingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.cardProcessingTitle}>Waiting for terminal...</Text>
          <Text style={styles.cardProcessingAmount}>
            {formatCurrency(portionCardPayment.payableAmount)}
          </Text>
          {currentPortion.tip > 0 && (
            <Text style={styles.cardProcessingTip}>
              (includes {formatCurrency(currentPortion.tip)} tip)
            </Text>
          )}
          <Text style={styles.cardProcessingHint}>Present card on the EFTPOS terminal</Text>
        </View>
      )}

      {/* Card portion — error */}
      {phase === 'portion_card_error' && (
        <View style={styles.cardErrorContainer}>
          <Text style={styles.cardErrorIcon}>!</Text>
          <Text style={styles.cardErrorTitle}>Payment Failed</Text>
          <Text style={styles.cardErrorMessage}>{cardError}</Text>
          <View style={styles.cardErrorActions}>
            <TouchableOpacity style={styles.cardRetryButton} onPress={processCardPortion}>
              <Text style={styles.cardRetryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.useCashButton}
              onPress={() => {
                setTenderedInput('');
                setPhase('portion_cash');
              }}
            >
              <Text style={styles.useCashButtonText}>Use Cash Instead</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cardBackButton}
              onPress={() => setPhase('portion_method')}
            >
              <Text style={styles.cardBackButtonText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Progress header
  progressHeader: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  progressDetail: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 2,
  },

  // Setup
  setupContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  setupTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  setupTipNote: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
    marginBottom: 32,
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 32,
  },
  modeButton: {
    width: 200,
    height: 200,
    backgroundColor: '#7c3aed',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modeButtonIcon: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
  },
  modeButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  modeButtonSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  setupCancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  setupCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },

  // By-method setup
  methodSetupContainer: {
    flex: 1,
    flexDirection: 'row',
    marginTop: 24,
    width: '100%',
  },
  methodSetupLeft: {
    flex: 1,
    paddingHorizontal: 24,
  },
  portionList: {
    marginBottom: 16,
  },
  portionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 8,
  },
  portionRowActive: {
    backgroundColor: '#ede9fe',
    borderWidth: 2,
    borderColor: '#7c3aed',
  },
  portionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  portionAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginRight: 12,
  },
  portionRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  portionRemoveText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  remainingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  addSplitButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  addSplitText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7c3aed',
  },
  setAmountButton: {
    backgroundColor: '#7c3aed',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  setAmountText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  fillRemainingButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#ede9fe',
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  fillRemainingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7c3aed',
  },
  setupActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  setupKeypad: {
    width: 320,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
  },

  // Even split setup
  evenSetupContainer: {
    alignItems: 'center',
  },
  evenLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  evenButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginBottom: 24,
  },
  evenButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  evenButtonActive: {
    backgroundColor: '#7c3aed',
  },
  evenButtonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  evenButtonTextActive: {
    color: '#fff',
  },
  evenPerPerson: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 24,
  },

  // Portion method selection
  portionMethodContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  portionMethodTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  portionTipNote: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
    marginBottom: 32,
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 32,
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
    backgroundColor: '#2563eb',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMethodIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  cardMethodSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  portionCancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  portionCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },

  // Cash entry (reused style names)
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
  tipLine: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 4,
  },
  roundingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  roundingText: {
    fontSize: 13,
    color: '#f59e0b',
    fontWeight: '500',
  },
  roundingArrow: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
  },
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
  cashActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cashBackButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
  },
  cashBackText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },

  // Confirm / Cancel buttons
  confirmButton: {
    flex: 1,
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
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

  // Card processing
  cardProcessingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  cardProcessingTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 24,
  },
  cardProcessingAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#2563eb',
    marginTop: 12,
  },
  cardProcessingTip: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 4,
  },
  cardProcessingHint: {
    fontSize: 16,
    color: '#999',
    marginTop: 16,
  },

  // Card error
  cardErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  cardErrorIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fef2f2',
    color: '#ef4444',
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 64,
    overflow: 'hidden',
  },
  cardErrorTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 16,
  },
  cardErrorMessage: {
    fontSize: 16,
    color: '#ef4444',
    marginTop: 8,
    textAlign: 'center',
  },
  cardErrorActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 32,
  },
  cardRetryButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#2563eb',
    borderRadius: 10,
  },
  cardRetryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  useCashButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#10b981',
    borderRadius: 10,
  },
  useCashButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cardBackButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
  },
  cardBackButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
});
