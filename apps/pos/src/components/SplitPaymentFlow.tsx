import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { calculatePaymentTotal } from '@float0/shared';
import type { CompletePaymentParams } from '../state/order-store';
import { getTerminalService } from '../services';
import { PaymentFailureScreen } from './PaymentFailureScreen';
import { colors, spacing, radii, typography } from '../theme/tokens';

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
const TERMINAL_TIMEOUT_MS = 30_000;

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
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      // First person absorbs remainder cents
      const firstAmount = Math.round((total - perPerson * (count - 1)) * 100) / 100;
      portions.push({ amount: firstAmount, tip: 0 });
    } else {
      portions.push({ amount: perPerson, tip: 0 });
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

  // Card failure state
  const [retryCount, setRetryCount] = useState(0);
  const [isTimeout, setIsTimeout] = useState(false);
  const [failedAmount, setFailedAmount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const logFailedAttempt = useCallback(
    (reason: string, amount: number, attempt: number, timeout: boolean) => {
      console.warn('[PaymentAudit] Split card payment failed', {
        orderNumber,
        portionIndex: currentPortionIndex,
        amount,
        reason,
        attempt,
        isTimeout: timeout,
        timestamp: new Date().toISOString(),
      });
    },
    [orderNumber, currentPortionIndex],
  );

  const processCardPortion = useCallback(async () => {
    setPhase('portion_card');
    setCardError('');
    setIsTimeout(false);

    const amountToCharge = portionCardPayment.payableAmount;
    setFailedAmount(amountToCharge);
    const terminal = getTerminalService();

    const timeoutPromise = new Promise<{ timedOut: true }>((resolve) => {
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        resolve({ timedOut: true });
      }, TERMINAL_TIMEOUT_MS);
    });

    try {
      const raceResult = await Promise.race([
        terminal.sendPayment(amountToCharge).then((r) => ({ timedOut: false as const, ...r })),
        timeoutPromise,
      ]);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if ('timedOut' in raceResult && raceResult.timedOut) {
        terminal.cancelTransaction();
        const attempt = retryCount + 1;
        setRetryCount(attempt);
        setIsTimeout(true);
        setCardError('Terminal Timeout');
        setPhase('portion_card_error');
        logFailedAttempt('Terminal Timeout', amountToCharge, attempt, true);
        return;
      }

      const result = raceResult;
      if (result.success) {
        setRetryCount(0);
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
        const errorMsg = result.errorMessage ?? 'Payment declined';
        const attempt = retryCount + 1;
        setRetryCount(attempt);
        setCardError(errorMsg);
        setPhase('portion_card_error');
        logFailedAttempt(errorMsg, amountToCharge, attempt, false);
      }
    } catch {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const attempt = retryCount + 1;
      setRetryCount(attempt);
      setCardError('Terminal communication error');
      setPhase('portion_card_error');
      logFailedAttempt('Terminal communication error', amountToCharge, attempt, false);
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
    retryCount,
    logFailedAttempt,
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
                  <ActivityIndicator color={colors.white} />
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
          <ActivityIndicator size="large" color={colors.primary} />
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
        <PaymentFailureScreen
          errorMessage={cardError}
          amount={failedAmount}
          retryCount={retryCount}
          isTimeout={isTimeout}
          onRetry={processCardPortion}
          onTryAnotherMethod={() => {
            setRetryCount(0);
            setIsTimeout(false);
            setPhase('portion_method');
          }}
          onCancelPayment={handleCancelSplit}
        />
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  progressTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  progressDetail: {
    fontSize: typography.size.base,
    color: '#94a3b8',
    marginTop: spacing.xxs,
  },

  // Setup
  setupContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
  },
  setupTitle: {
    fontSize: typography.size['4xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  setupTipNote: {
    fontSize: typography.size.base,
    color: colors.success,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.xxl,
  },
  modeButtons: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.xxl,
  },
  modeButton: {
    width: 200,
    height: 200,
    backgroundColor: colors.pack,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modeButtonIcon: {
    fontSize: typography.size['5xl'],
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  modeButtonText: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.white,
    marginTop: spacing.sm,
  },
  modeButtonSub: {
    fontSize: typography.size.md,
    color: 'rgba(255,255,255,0.7)',
    marginTop: spacing.xs,
  },
  setupCancelButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radii.md,
  },
  setupCancelText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },

  // By-method setup
  methodSetupContainer: {
    flex: 1,
    flexDirection: 'row',
    marginTop: spacing.xl,
    width: '100%',
  },
  methodSetupLeft: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  portionList: {
    marginBottom: spacing.lg,
  },
  portionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
  },
  portionRowActive: {
    backgroundColor: '#ede9fe',
    borderWidth: 2,
    borderColor: colors.pack,
  },
  portionLabel: {
    flex: 1,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  portionAmount: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginRight: spacing.md,
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
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  remainingLabel: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  addSplitButton: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: radii.md,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
  },
  addSplitText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.pack,
  },
  setAmountButton: {
    backgroundColor: colors.pack,
    paddingVertical: 14,
    borderRadius: radii.lg,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  setAmountText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.white,
  },
  fillRemainingButton: {
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    backgroundColor: '#ede9fe',
    borderRadius: radii.md,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
  },
  fillRemainingText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.pack,
  },
  setupActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  setupKeypad: {
    width: 320,
    padding: spacing.xl,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },

  // Even split setup
  evenSetupContainer: {
    alignItems: 'center',
  },
  evenLabel: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  evenButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  evenButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  evenButtonActive: {
    backgroundColor: colors.pack,
  },
  evenButtonText: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  evenButtonTextActive: {
    color: colors.white,
  },
  evenPerPerson: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },

  // Portion method selection
  portionMethodContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
  },
  portionMethodTitle: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  portionTipNote: {
    fontSize: typography.size.base,
    color: colors.success,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.xxl,
  },
  methodButtons: {
    flexDirection: 'row',
    gap: spacing.xl,
    marginBottom: spacing.xxl,
  },
  cashMethodButton: {
    width: 200,
    height: 200,
    backgroundColor: colors.success,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cashMethodIcon: {
    fontSize: 48,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  cashMethodText: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.semibold,
    color: colors.white,
    marginTop: spacing.sm,
  },
  cardMethodButton: {
    width: 200,
    height: 200,
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardMethodIcon: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  cardMethodSubtext: {
    fontSize: typography.size.base,
    color: 'rgba(255,255,255,0.7)',
    marginTop: spacing.xs,
  },
  portionCancelButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radii.md,
  },
  portionCancelText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },

  // Cash entry (reused style names)
  cashContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  cashLeft: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  cashRight: {
    width: 320,
    padding: spacing.xl,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  amountSection: {
    marginBottom: 20,
  },
  amountLabel: {
    fontSize: typography.size.base,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  amountTotal: {
    fontSize: typography.size['5xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  amountTendered: {
    fontSize: typography.size['5xl'],
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  changeSection: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radii.lg,
  },
  amountChange: {
    fontSize: typography.size['5xl'],
    fontWeight: typography.weight.bold,
    color: colors.success,
  },
  amountInsufficient: {
    fontSize: typography.size['3xl'],
    color: '#ef4444',
  },
  tipLine: {
    fontSize: typography.size.base,
    color: colors.success,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.xs,
  },
  roundingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  roundingText: {
    fontSize: typography.size.md,
    color: colors.warning,
    fontWeight: typography.weight.medium,
  },
  roundingArrow: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    fontWeight: typography.weight.semibold,
  },
  quickTenderSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  quickTenderLabel: {
    fontSize: typography.size.base,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  quickTenderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickTenderButton: {
    paddingHorizontal: 20,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickTenderText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  cashActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cashBackButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
  },
  cashBackText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },

  // Confirm / Cancel buttons
  confirmButton: {
    flex: 1,
    backgroundColor: colors.success,
    paddingVertical: 14,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  buttonDisabled: {
    backgroundColor: colors.textDisabled,
  },
  cancelButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
  },
  cancelButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },

  // Keypad
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
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

  // Card processing
  cardProcessingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
  },
  cardProcessingTitle: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginTop: spacing.xl,
  },
  cardProcessingAmount: {
    fontSize: typography.size['5xl'],
    fontWeight: typography.weight.bold,
    color: colors.primary,
    marginTop: spacing.md,
  },
  cardProcessingTip: {
    fontSize: typography.size.base,
    color: colors.success,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.xs,
  },
  cardProcessingHint: {
    fontSize: typography.size.lg,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});
