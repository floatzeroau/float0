import React, { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ActivityIndicator } from 'react-native';
import { calculatePaymentTotal } from '@float0/shared';
import type { ReceiptData } from '@float0/shared';
import type { CompletePaymentParams } from '../state/order-store';
import { getTerminalService } from '../services';
import { TipPrompt } from './TipPrompt';
import { SplitPaymentFlow } from './SplitPaymentFlow';
import { PaymentConfirmationScreen } from '../screens/PaymentConfirmationScreen';
import type { PaymentConfirmationData } from '../screens/PaymentConfirmationScreen';
import { PaymentFailureScreen } from './PaymentFailureScreen';
import { colors, spacing, radii, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentScreenProps {
  visible: boolean;
  orderTotal: number;
  orderNumber: string;
  orderId: string;
  customerEmail?: string;
  packCount?: number;
  onComplete: (params: CompletePaymentParams) => Promise<ReceiptData | undefined>;
  onRecordPartialPayment: (params: CompletePaymentParams) => Promise<void>;
  onCancel: () => void;
}

type Phase =
  | 'method'
  | 'tip'
  | 'cash'
  | 'card_processing'
  | 'card_error'
  | 'split'
  | 'confirmation';

const QUICK_TENDER_VALUES = [5, 10, 20, 50, 100];
const TIP_ENABLED = true;
const TERMINAL_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// PaymentScreen
// ---------------------------------------------------------------------------

export function PaymentScreen({
  visible,
  orderTotal,
  orderNumber,
  orderId,
  customerEmail,
  packCount,
  onComplete,
  onRecordPartialPayment,
  onCancel,
}: PaymentScreenProps) {
  const [phase, setPhase] = useState<Phase>('method');
  const [tenderedInput, setTenderedInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [cardError, setCardError] = useState('');
  const [tipAmount, setTipAmount] = useState(0);
  const [selectedMethod, setSelectedMethod] = useState<'cash' | 'card' | null>(null);
  const [confirmationData, setConfirmationData] = useState<PaymentConfirmationData | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isTimeout, setIsTimeout] = useState(false);
  const [failedAmount, setFailedAmount] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalWithTip = orderTotal + tipAmount;
  const cashPayment = useMemo(() => calculatePaymentTotal(totalWithTip, 'cash'), [totalWithTip]);
  const cardPayment = useMemo(() => calculatePaymentTotal(totalWithTip, 'card'), [totalWithTip]);

  const tenderedAmount = useMemo(() => {
    if (tenderedInput === '') return 0;
    return parseFloat(tenderedInput) / 100;
  }, [tenderedInput]);

  const changeAmount = useMemo(
    () => Math.max(0, tenderedAmount - cashPayment.payableAmount),
    [tenderedAmount, cashPayment.payableAmount],
  );

  const isSufficient = tenderedAmount >= cashPayment.payableAmount;

  const quickTenderOptions = useMemo(
    () => QUICK_TENDER_VALUES.filter((v) => v >= cashPayment.payableAmount),
    [cashPayment.payableAmount],
  );

  const handleReset = useCallback(() => {
    setPhase('method');
    setTenderedInput('');
    setLoading(false);
    setCardError('');
    setTipAmount(0);
    setSelectedMethod(null);
    setRetryCount(0);
    setIsTimeout(false);
    setFailedAmount(0);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const showConfirmation = useCallback((data: PaymentConfirmationData) => {
    setConfirmationData(data);
    setLoading(false);
    setPhase('confirmation');
  }, []);

  const handleConfirmationDone = useCallback(() => {
    handleReset();
    onCancel();
  }, [handleReset, onCancel]);

  const handleCancel = useCallback(() => {
    if (phase === 'card_processing') {
      const terminal = getTerminalService();
      terminal.cancelTransaction();
    }
    handleReset();
    onCancel();
  }, [handleReset, onCancel, phase]);

  const handleCashSelect = useCallback(() => {
    if (TIP_ENABLED) {
      setSelectedMethod('cash');
      setPhase('tip');
    } else {
      setPhase('cash');
      setTenderedInput('');
    }
  }, []);

  const logFailedAttempt = useCallback(
    (reason: string, amount: number, attempt: number, timeout: boolean) => {
      console.warn('[PaymentAudit] Card payment failed', {
        orderNumber,
        amount,
        reason,
        attempt,
        isTimeout: timeout,
        timestamp: new Date().toISOString(),
      });
    },
    [orderNumber],
  );

  const processCardPayment = useCallback(
    async (tip: number) => {
      setPhase('card_processing');
      setCardError('');
      setIsTimeout(false);

      const amountToCharge = calculatePaymentTotal(orderTotal + tip, 'card').payableAmount;
      setFailedAmount(amountToCharge);
      const terminal = getTerminalService();

      // Race terminal response against timeout
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

        // Clear timeout if terminal responded first
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
          setPhase('card_error');
          logFailedAttempt('Terminal Timeout', amountToCharge, attempt, true);
          return;
        }

        const result = raceResult;
        if (result.success) {
          setRetryCount(0);
          setLoading(true);
          const receiptData = await onComplete({
            method: 'card',
            amount: amountToCharge,
            tipAmount: tip,
            approvalCode: result.approvalCode ?? '',
            cardType: result.cardType ?? '',
            lastFour: result.lastFour ?? '',
          });
          showConfirmation({
            orderId,
            orderNumber,
            orderTotal,
            totalPaid: amountToCharge,
            tipAmount: tip,
            paymentMethod: 'card',
            cardLastFour: result.lastFour ?? '',
            cardType: result.cardType ?? '',
            approvalCode: result.approvalCode ?? '',
            receiptData,
            customerEmail,
          });
        } else {
          const errorMsg = result.errorMessage ?? 'Payment declined';
          const attempt = retryCount + 1;
          setRetryCount(attempt);
          setCardError(errorMsg);
          setPhase('card_error');
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
        setPhase('card_error');
        logFailedAttempt('Terminal communication error', amountToCharge, attempt, false);
      }
    },
    [
      orderTotal,
      orderNumber,
      orderId,
      customerEmail,
      onComplete,
      showConfirmation,
      retryCount,
      logFailedAttempt,
    ],
  );

  const handleSplitSelect = useCallback(() => {
    if (TIP_ENABLED) {
      setSelectedMethod(null);
      setPhase('tip');
    } else {
      setPhase('split');
    }
  }, []);

  const handleCardMethodSelect = useCallback(() => {
    if (TIP_ENABLED) {
      setSelectedMethod('card');
      setPhase('tip');
    } else {
      processCardPayment(0);
    }
  }, [processCardPayment]);

  const handleTipSelected = useCallback(
    (tip: number) => {
      setTipAmount(tip);
      if (selectedMethod === 'cash') {
        setPhase('cash');
        setTenderedInput('');
      } else if (selectedMethod === 'card') {
        processCardPayment(tip);
      } else {
        // split mode
        setPhase('split');
      }
    },
    [selectedMethod, processCardPayment],
  );

  const handleTipCancel = useCallback(() => {
    setTipAmount(0);
    setSelectedMethod(null);
    setPhase('method');
  }, []);

  const handleKeyPress = useCallback((key: string) => {
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
    setTenderedInput(String(Math.round(cashPayment.payableAmount * 100)));
  }, [cashPayment.payableAmount]);

  const handleCashConfirm = useCallback(async () => {
    if (!isSufficient || loading) return;
    setLoading(true);
    try {
      const receiptData = await onComplete({
        method: 'cash',
        amount: cashPayment.payableAmount,
        tipAmount,
        tenderedAmount,
        changeGiven: changeAmount,
        roundingAmount: cashPayment.roundingAmount,
      });
      showConfirmation({
        orderId,
        orderNumber,
        orderTotal,
        totalPaid: cashPayment.payableAmount,
        tipAmount,
        paymentMethod: 'cash',
        changeGiven: changeAmount,
        receiptData,
        customerEmail,
      });
    } catch {
      setLoading(false);
    }
  }, [
    isSufficient,
    loading,
    onComplete,
    cashPayment,
    tipAmount,
    tenderedAmount,
    changeAmount,
    showConfirmation,
    orderNumber,
    orderTotal,
    orderId,
    customerEmail,
  ]);

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;

  const formatRounding = (val: number) => {
    if (val === 0) return '$0.00';
    const sign = val > 0 ? '+' : '-';
    return `${sign}$${Math.abs(val).toFixed(2)}`;
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['landscape-left', 'landscape-right']}
    >
      <View style={styles.container}>
        {/* Header — hidden during confirmation */}
        {phase !== 'confirmation' && (
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={handleCancel}>
              <Text style={styles.backButtonText}>
                {phase === 'card_processing' ? 'Cancel' : 'Back'}
              </Text>
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              <Text style={styles.headerTitle}>Payment — {orderNumber}</Text>
              {packCount != null && packCount > 0 && (
                <Text
                  style={{
                    fontSize: typography.size.sm,
                    fontWeight: typography.weight.semibold,
                    color: colors.pack,
                    marginTop: spacing.xxs,
                  }}
                >
                  Includes {packCount} Cafe Pack{packCount > 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <View style={styles.headerTotalContainer}>
              {tipAmount > 0 ? (
                <>
                  <Text style={styles.headerTotalLabel}>Subtotal</Text>
                  <Text style={styles.headerSubtotalValue}>{formatCurrency(orderTotal)}</Text>
                  <Text style={styles.headerTipLabel}>Tip: {formatCurrency(tipAmount)}</Text>
                  <Text style={styles.headerTotalLabel}>Total</Text>
                  <Text style={styles.headerTotalValue}>{formatCurrency(totalWithTip)}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.headerTotalLabel}>Total</Text>
                  <Text style={styles.headerTotalValue}>{formatCurrency(orderTotal)}</Text>
                </>
              )}
            </View>
          </View>
        )}

        {/* Phase 1: Method Selection */}
        {phase === 'method' && (
          <View style={styles.methodContainer}>
            <Text style={styles.methodTitle}>Select Payment Method</Text>
            <View style={styles.methodButtons}>
              <TouchableOpacity style={styles.cashMethodButton} onPress={handleCashSelect}>
                <Text style={styles.cashMethodIcon}>$</Text>
                <Text style={styles.cashMethodText}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cardMethodButton} onPress={handleCardMethodSelect}>
                <Text style={styles.cardMethodIcon}>Card</Text>
                <Text style={styles.cardMethodSubtext}>EFTPOS</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.splitMethodButton} onPress={handleSplitSelect}>
                <Text style={styles.splitMethodIcon}>÷</Text>
                <Text style={styles.splitMethodText}>Split</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Phase 1.5: Tip Prompt */}
        {phase === 'tip' && (
          <TipPrompt
            orderTotal={orderTotal}
            onSelectTip={handleTipSelected}
            onCancel={handleTipCancel}
          />
        )}

        {/* Phase 2: Cash Entry */}
        {phase === 'cash' && (
          <View style={styles.cashContainer}>
            {/* Left side: amounts */}
            <View style={styles.cashLeft}>
              {/* Total with rounding breakdown */}
              <View style={styles.amountSection}>
                <Text style={styles.amountLabel}>Order Total</Text>
                <Text style={styles.amountTotal}>{formatCurrency(orderTotal)}</Text>
                {tipAmount > 0 && (
                  <Text style={styles.tipLine}>
                    Tip: {formatCurrency(tipAmount)} → {formatCurrency(totalWithTip)}
                  </Text>
                )}
                {cashPayment.roundingAmount !== 0 && (
                  <View style={styles.roundingRow}>
                    <Text style={styles.roundingText}>
                      Rounding: {formatRounding(cashPayment.roundingAmount)}
                    </Text>
                    <Text style={styles.roundingArrow}>
                      {' '}
                      Cash: {formatCurrency(cashPayment.payableAmount)}
                    </Text>
                  </View>
                )}
                {cashPayment.roundingAmount === 0 && (
                  <Text style={styles.roundingTextNeutral}>No rounding needed</Text>
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

        {/* Phase 3: Card Processing */}
        {phase === 'card_processing' && (
          <View style={styles.cardProcessingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.cardProcessingTitle}>Waiting for terminal...</Text>
            <Text style={styles.cardProcessingAmount}>
              {formatCurrency(cardPayment.payableAmount)}
            </Text>
            {tipAmount > 0 && (
              <Text style={styles.cardProcessingTip}>
                (includes {formatCurrency(tipAmount)} tip)
              </Text>
            )}
            <Text style={styles.cardProcessingHint}>Present card on the EFTPOS terminal</Text>
          </View>
        )}

        {/* Phase 4: Card Error */}
        {phase === 'card_error' && (
          <PaymentFailureScreen
            errorMessage={cardError}
            amount={failedAmount}
            retryCount={retryCount}
            isTimeout={isTimeout}
            onRetry={() => processCardPayment(tipAmount)}
            onTryAnotherMethod={() => {
              setRetryCount(0);
              setIsTimeout(false);
              setTipAmount(0);
              setSelectedMethod(null);
              setPhase('method');
            }}
            onCancelPayment={() => {
              handleReset();
              onCancel();
            }}
          />
        )}

        {/* Phase: Split Payment */}
        {phase === 'split' && (
          <SplitPaymentFlow
            orderTotal={orderTotal}
            orderNumber={orderNumber}
            tipAmount={tipAmount}
            onRecordPartialPayment={onRecordPartialPayment}
            onComplete={async (params) => {
              const receiptData = await onComplete(params);
              showConfirmation({
                orderId,
                orderNumber,
                orderTotal: orderTotal + tipAmount,
                totalPaid: orderTotal + tipAmount,
                tipAmount,
                paymentMethod: 'split',
                receiptData,
                customerEmail,
              });
            }}
            onCancel={() => {
              setTipAmount(0);
              setSelectedMethod(null);
              setPhase('method');
            }}
          />
        )}

        {/* Phase: Confirmation */}
        {phase === 'confirmation' && confirmationData && (
          <PaymentConfirmationScreen data={confirmationData} onDone={handleConfirmationDone} />
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
    backgroundColor: colors.surfaceAlt,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radii.md,
  },
  backButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  headerTitle: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  headerTotalContainer: {
    alignItems: 'flex-end',
  },
  headerTotalLabel: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  headerSubtotalValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  headerTipLabel: {
    fontSize: typography.size.sm,
    color: colors.success,
    fontWeight: typography.weight.semibold,
  },
  headerTotalValue: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },

  // Method selection
  methodContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
  },
  methodTitle: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xxxl,
  },
  methodButtons: {
    flexDirection: 'row',
    gap: spacing.xl,
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
  splitMethodButton: {
    width: 200,
    height: 200,
    backgroundColor: colors.pack,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splitMethodIcon: {
    fontSize: 48,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  splitMethodText: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.semibold,
    color: colors.white,
    marginTop: spacing.sm,
  },

  // Cash entry
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

  // Amount displays
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

  // Tip line in cash phase
  tipLine: {
    fontSize: typography.size.base,
    color: colors.success,
    fontWeight: typography.weight.semibold,
    marginTop: spacing.xs,
  },

  // Rounding
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
  roundingTextNeutral: {
    fontSize: typography.size.md,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  // Quick tender
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

  // Confirm button
  confirmButton: {
    backgroundColor: colors.success,
    paddingVertical: 18,
    borderRadius: radii.lg,
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: colors.textDisabled,
  },
  confirmButtonText: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.white,
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
