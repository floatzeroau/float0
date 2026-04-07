import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { OrderItem, Product } from '../db/models';
import { useOrder } from '../state/order-store';
import { getTerminalService } from '../services';
import { API_URL } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RefundOrderData {
  id: string;
  orderNumber: string;
  total: number;
  originalPaymentMethod: 'cash' | 'card' | 'split';
  originalApprovalCode?: string;
}

interface RefundScreenProps {
  visible: boolean;
  order: RefundOrderData | null;
  onClose: () => void;
}

interface RefundItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  selected: boolean;
}

type RefundMode = 'select' | 'full' | 'partial';
type RefundPhase =
  | 'mode'
  | 'items'
  | 'reason'
  | 'pin'
  | 'method'
  | 'terminal_processing'
  | 'processing'
  | 'terminal_failed'
  | 'done';

const PIN_LENGTH = 4;
const ORG_ID_KEY = 'float0_org_id';

// ---------------------------------------------------------------------------
// RefundScreen
// ---------------------------------------------------------------------------

export function RefundScreen({ visible, order, onClose }: RefundScreenProps) {
  const { refundOrder } = useOrder();

  // Phase & mode
  const [mode, setMode] = useState<RefundMode>('select');
  const [phase, setPhase] = useState<RefundPhase>('mode');

  // Items for partial refund
  const [items, setItems] = useState<RefundItem[]>([]);
  const [customAmount, setCustomAmount] = useState('');
  const [useCustomAmount, setUseCustomAmount] = useState(false);

  // Reason
  const [reason, setReason] = useState('');

  // Manager PIN
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [approvedManagerId, setApprovedManagerId] = useState('');
  const shakeAnim = useState(() => new Animated.Value(0))[0];

  // Refund method
  const [refundMethod, setRefundMethod] = useState<'cash' | 'card'>('cash');

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [terminalError, setTerminalError] = useState('');

  // Animated dots for terminal processing
  const terminalDot1 = useState(() => new Animated.Value(0.3))[0];
  const terminalDot2 = useState(() => new Animated.Value(0.3))[0];
  const terminalDot3 = useState(() => new Animated.Value(0.3))[0];

  // Load items when order changes
  useEffect(() => {
    if (!order || !visible) return;

    (async () => {
      const orderItems = await database
        .get<OrderItem>('order_items')
        .query(Q.where('order_id', order.id))
        .fetch();

      const loaded: RefundItem[] = await Promise.all(
        orderItems
          .filter((oi) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw = (oi as any)._raw;
            return !raw.voided_at; // skip voided items
          })
          .map(async (oi) => {
            let productName = 'Unknown';
            try {
              const product = await database.get<Product>('products').find(oi.productId);
              productName = product.name;
            } catch {
              // deleted product
            }
            return {
              id: oi.id,
              productName,
              quantity: oi.quantity,
              unitPrice: oi.unitPrice,
              lineTotal: oi.lineTotal,
              selected: false,
            };
          }),
      );
      setItems(loaded);
    })();
  }, [order, visible]);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setMode('select');
      setPhase('mode');
      setReason('');
      setPin('');
      setPinError('');
      setPinLoading(false);
      setApprovedManagerId('');
      setCustomAmount('');
      setUseCustomAmount(false);
      setRefundMethod(order?.originalPaymentMethod === 'card' ? 'card' : 'cash');
      setProcessing(false);
      setTerminalError('');
    }
  }, [visible, order]);

  // Animated dots loop for terminal processing
  useEffect(() => {
    if (phase !== 'terminal_processing') return;

    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ]),
      );

    const a1 = animate(terminalDot1, 0);
    const a2 = animate(terminalDot2, 200);
    const a3 = animate(terminalDot3, 400);
    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [phase, terminalDot1, terminalDot2, terminalDot3]);

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;

  // ---------------------------------------------------------------------------
  // Refund amount calculation
  // ---------------------------------------------------------------------------

  const selectedItemsTotal = useMemo(
    () => items.filter((i) => i.selected).reduce((sum, i) => sum + i.lineTotal, 0),
    [items],
  );

  const parsedCustomAmount = useMemo(() => {
    if (customAmount === '') return 0;
    const val = parseFloat(customAmount);
    return isNaN(val) ? 0 : val;
  }, [customAmount]);

  const refundAmount = useMemo(() => {
    if (!order) return 0;
    if (mode === 'full') return order.total;
    if (useCustomAmount) return Math.min(parsedCustomAmount, order.total);
    return selectedItemsTotal;
  }, [mode, order, useCustomAmount, parsedCustomAmount, selectedItemsTotal]);

  const selectedItemIds = useMemo(() => items.filter((i) => i.selected).map((i) => i.id), [items]);

  // ---------------------------------------------------------------------------
  // Item selection
  // ---------------------------------------------------------------------------

  const toggleItem = useCallback((itemId: string) => {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, selected: !i.selected } : i)));
  }, []);

  const selectAll = useCallback(() => {
    setItems((prev) => prev.map((i) => ({ ...i, selected: true })));
  }, []);

  const selectNone = useCallback(() => {
    setItems((prev) => prev.map((i) => ({ ...i, selected: false })));
  }, []);

  // ---------------------------------------------------------------------------
  // PIN handling (matches VoidItemModal pattern)
  // ---------------------------------------------------------------------------

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
        setApprovedManagerId(body.staffId ?? 'manager');
        setPin('');
        setPhase('method');
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
    if (phase === 'pin' && pin.length === PIN_LENGTH) {
      verifyPin();
    }
  }, [phase, pin.length, verifyPin]);

  // ---------------------------------------------------------------------------
  // Refund execution
  // ---------------------------------------------------------------------------

  const processRefundRecord = useCallback(
    async (
      method: 'cash' | 'card',
      terminalData?: { approvalCode: string; cardType: string; cardLastFour: string },
    ) => {
      await refundOrder({
        orderId: order!.id,
        refundAmount,
        reason,
        refundMethod: method,
        managerApprover: approvedManagerId,
        isFullRefund: mode === 'full',
        refundedItemIds: mode === 'partial' && !useCustomAmount ? selectedItemIds : undefined,
        ...(terminalData && {
          approvalCode: terminalData.approvalCode,
          cardType: terminalData.cardType,
          cardLastFour: terminalData.cardLastFour,
        }),
      });
    },
    [
      order,
      refundOrder,
      refundAmount,
      reason,
      approvedManagerId,
      mode,
      useCustomAmount,
      selectedItemIds,
    ],
  );

  const executeRefund = useCallback(async () => {
    if (!order || processing) return;
    setProcessing(true);

    if (refundMethod === 'card') {
      // Card refund — send through terminal
      setPhase('terminal_processing');
      try {
        const terminalService = getTerminalService();
        const result = await terminalService.sendRefund(
          refundAmount,
          order.originalApprovalCode ?? '',
        );

        if (!result.success) {
          setTerminalError(result.errorMessage ?? 'Card refund declined by terminal');
          setProcessing(false);
          setPhase('terminal_failed');
          return;
        }

        // Terminal success — create refund record with card method
        setPhase('processing');
        await processRefundRecord('card', {
          approvalCode: result.approvalCode ?? '',
          cardType: result.cardType ?? '',
          cardLastFour: result.lastFour ?? '',
        });
        setPhase('done');
      } catch (err) {
        setTerminalError(err instanceof Error ? err.message : 'Terminal communication error');
        setProcessing(false);
        setPhase('terminal_failed');
      }
    } else {
      // Cash refund — direct
      setPhase('processing');
      try {
        await processRefundRecord('cash');
        setPhase('done');
      } catch (err) {
        setProcessing(false);
        Alert.alert('Refund Failed', err instanceof Error ? err.message : 'An error occurred');
        setPhase('method');
      }
    }
  }, [order, processing, refundMethod, refundAmount, processRefundRecord]);

  const handleCashFallback = useCallback(async () => {
    if (!order) return;
    setProcessing(true);
    setRefundMethod('cash');
    setPhase('processing');

    try {
      await processRefundRecord('cash');
      setPhase('done');
    } catch (err) {
      setProcessing(false);
      Alert.alert('Refund Failed', err instanceof Error ? err.message : 'An error occurred');
      setPhase('method');
    }
  }, [order, processRefundRecord]);

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------

  const canProceedFromItems =
    mode === 'partial' && (useCustomAmount ? parsedCustomAmount > 0 : selectedItemsTotal > 0);

  const canProceedFromReason = reason.trim().length > 0;

  const handleModeSelect = useCallback((selected: RefundMode) => {
    setMode(selected);
    if (selected === 'full') {
      setPhase('reason');
    } else {
      setPhase('items');
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!order) return null;

  const pinDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '\u232B'];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      supportedOrientations={['landscape-left', 'landscape-right']}
    >
      <View style={styles.container}>
        {/* Header */}
        {phase !== 'done' && (
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={onClose}>
              <Text style={styles.backButtonText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Refund — {order.orderNumber}</Text>
            <View style={styles.headerRight}>
              <Text style={styles.headerTotal}>{formatCurrency(order.total)}</Text>
            </View>
          </View>
        )}

        {/* Mode Selection */}
        {phase === 'mode' && (
          <View style={styles.centerContainer}>
            <Text style={styles.sectionTitle}>Select Refund Type</Text>
            <View style={styles.modeButtons}>
              <TouchableOpacity
                style={styles.modeButtonFull}
                onPress={() => handleModeSelect('full')}
              >
                <Text style={styles.modeButtonIcon}>$</Text>
                <Text style={styles.modeButtonLabel}>Full Refund</Text>
                <Text style={styles.modeButtonSub}>{formatCurrency(order.total)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modeButtonPartial}
                onPress={() => handleModeSelect('partial')}
              >
                <Text style={styles.modeButtonIcon}>%</Text>
                <Text style={styles.modeButtonLabel}>Partial Refund</Text>
                <Text style={styles.modeButtonSub}>Select items or enter amount</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Item Selection (partial) */}
        {phase === 'items' && (
          <View style={styles.itemsContainer}>
            <View style={styles.itemsHeader}>
              <Text style={styles.sectionTitle}>Select Items to Refund</Text>
              <View style={styles.itemsHeaderActions}>
                <TouchableOpacity style={styles.selectAllButton} onPress={selectAll}>
                  <Text style={styles.selectAllText}>Select All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.selectAllButton} onPress={selectNone}>
                  <Text style={styles.selectAllText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={false}>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.itemRow, item.selected && styles.itemRowSelected]}
                  onPress={() => toggleItem(item.id)}
                >
                  <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                    {item.selected && <Text style={styles.checkboxMark}>{'\u2713'}</Text>}
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName}>
                      {item.quantity}x {item.productName}
                    </Text>
                  </View>
                  <Text style={styles.itemTotal}>{formatCurrency(item.lineTotal)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Custom amount toggle */}
            <View style={styles.customAmountSection}>
              <TouchableOpacity
                style={styles.customAmountToggle}
                onPress={() => setUseCustomAmount(!useCustomAmount)}
              >
                <View style={[styles.checkbox, useCustomAmount && styles.checkboxSelected]}>
                  {useCustomAmount && <Text style={styles.checkboxMark}>{'\u2713'}</Text>}
                </View>
                <Text style={styles.customAmountLabel}>Custom amount instead</Text>
              </TouchableOpacity>

              {useCustomAmount && (
                <View style={styles.customAmountInputRow}>
                  <Text style={styles.dollarSign}>$</Text>
                  <TextInput
                    style={styles.customAmountInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor="#999"
                    value={customAmount}
                    onChangeText={setCustomAmount}
                  />
                  <Text style={styles.customAmountCap}>max {formatCurrency(order.total)}</Text>
                </View>
              )}
            </View>

            {/* Refund total */}
            <View style={styles.refundTotalRow}>
              <Text style={styles.refundTotalLabel}>Refund Amount</Text>
              <Text style={styles.refundTotalValue}>{formatCurrency(refundAmount)}</Text>
            </View>

            {/* Actions */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.cancelFooterButton} onPress={() => setPhase('mode')}>
                <Text style={styles.cancelFooterText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.proceedButton, !canProceedFromItems && styles.buttonDisabled]}
                onPress={() => setPhase('reason')}
                disabled={!canProceedFromItems}
              >
                <Text style={styles.proceedButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Reason entry */}
        {phase === 'reason' && (
          <View style={styles.centerContainer}>
            <Text style={styles.sectionTitle}>Refund Reason</Text>
            <Text style={styles.refundSummaryText}>
              {mode === 'full' ? 'Full' : 'Partial'} refund: {formatCurrency(refundAmount)}
            </Text>

            <TextInput
              style={styles.reasonInput}
              placeholder="Enter reason for refund (required)"
              placeholderTextColor="#999"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
            />

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancelFooterButton}
                onPress={() => setPhase(mode === 'full' ? 'mode' : 'items')}
              >
                <Text style={styles.cancelFooterText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.proceedButton, !canProceedFromReason && styles.buttonDisabled]}
                onPress={() => {
                  setPin('');
                  setPinError('');
                  setPhase('pin');
                }}
                disabled={!canProceedFromReason}
              >
                <Text style={styles.proceedButtonText}>Manager Approval</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Manager PIN */}
        {phase === 'pin' && (
          <View style={styles.centerContainer}>
            <Text style={styles.sectionTitle}>Manager PIN Required</Text>
            <Text style={styles.refundSummaryText}>
              Refund {formatCurrency(refundAmount)} — {order.orderNumber}
            </Text>

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

            <TouchableOpacity style={styles.cancelFooterButton} onPress={() => setPhase('reason')}>
              <Text style={styles.cancelFooterText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Refund Method Selection */}
        {phase === 'method' && (
          <View style={styles.centerContainer}>
            <Text style={styles.sectionTitle}>Refund Method</Text>
            <Text style={styles.refundSummaryText}>
              Refund {formatCurrency(refundAmount)} for {order.orderNumber}
            </Text>
            <Text style={styles.approvedText}>Manager Approved</Text>

            <View style={styles.methodButtons}>
              <TouchableOpacity
                style={[styles.methodButton, refundMethod === 'cash' && styles.methodButtonActive]}
                onPress={() => setRefundMethod('cash')}
              >
                <Text
                  style={[
                    styles.methodButtonLabel,
                    refundMethod === 'cash' && styles.methodButtonLabelActive,
                  ]}
                >
                  $
                </Text>
                <Text
                  style={[
                    styles.methodButtonText,
                    refundMethod === 'cash' && styles.methodButtonTextActive,
                  ]}
                >
                  Cash Refund
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.methodButton, refundMethod === 'card' && styles.methodButtonActive]}
                onPress={() => setRefundMethod('card')}
              >
                <Text
                  style={[
                    styles.methodButtonLabel,
                    refundMethod === 'card' && styles.methodButtonLabelActive,
                  ]}
                >
                  Card
                </Text>
                <Text
                  style={[
                    styles.methodButtonText,
                    refundMethod === 'card' && styles.methodButtonTextActive,
                  ]}
                >
                  Refund to Card
                </Text>
                <Text style={styles.methodButtonSub}>Via terminal</Text>
              </TouchableOpacity>
            </View>

            {/* Confirmation */}
            <View style={styles.confirmBox}>
              <Text style={styles.confirmText}>
                Refund {formatCurrency(refundAmount)} to customer?
              </Text>
              <Text style={styles.confirmDetail}>
                Method: {refundMethod === 'cash' ? 'Cash' : 'Card'} · Reason: {reason}
              </Text>
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.cancelFooterButton}
                onPress={() => {
                  setPin('');
                  setPinError('');
                  setApprovedManagerId('');
                  setPhase('reason');
                }}
              >
                <Text style={styles.cancelFooterText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.refundButton} onPress={executeRefund}>
                <Text style={styles.refundButtonText}>
                  Process Refund — {formatCurrency(refundAmount)}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Terminal Processing */}
        {phase === 'terminal_processing' && (
          <View style={styles.centerContainer}>
            <View style={styles.terminalIconCircle}>
              <Text style={styles.terminalIcon}>Card</Text>
            </View>
            <Text style={styles.processingText}>Processing refund on terminal...</Text>
            <Text style={styles.processingAmount}>{formatCurrency(refundAmount)}</Text>
            <View style={styles.terminalDots}>
              <Animated.View style={[styles.terminalDot, { opacity: terminalDot1 }]} />
              <Animated.View style={[styles.terminalDot, { opacity: terminalDot2 }]} />
              <Animated.View style={[styles.terminalDot, { opacity: terminalDot3 }]} />
            </View>
            <Text style={styles.terminalHint}>Please wait for terminal response</Text>
          </View>
        )}

        {/* Terminal Failed — offer cash fallback */}
        {phase === 'terminal_failed' && (
          <View style={styles.centerContainer}>
            <View style={styles.failCircle}>
              <Text style={styles.failIcon}>!</Text>
            </View>
            <Text style={styles.failTitle}>Card Refund Failed</Text>
            <Text style={styles.failMessage}>{terminalError}</Text>
            <Text style={styles.failPrompt}>Issue cash refund instead?</Text>

            <View style={styles.failButtons}>
              <TouchableOpacity style={styles.cashFallbackButton} onPress={handleCashFallback}>
                <Text style={styles.cashFallbackText}>
                  Cash Refund — {formatCurrency(refundAmount)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.retryTerminalButton}
                onPress={() => {
                  setProcessing(false);
                  executeRefund();
                }}
              >
                <Text style={styles.retryTerminalText}>Retry Card Refund</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelFailButton}
                onPress={() => {
                  setProcessing(false);
                  setPhase('method');
                }}
              >
                <Text style={styles.cancelFailText}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Processing (record creation) */}
        {phase === 'processing' && (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
            <Text style={styles.processingText}>Processing Refund...</Text>
          </View>
        )}

        {/* Done */}
        {phase === 'done' && (
          <View style={styles.centerContainer}>
            <View style={styles.doneCircle}>
              <Text style={styles.doneCheck}>{'\u2713'}</Text>
            </View>
            <Text style={styles.doneTitle}>Refund Processed</Text>
            <Text style={styles.doneSummary}>
              {formatCurrency(refundAmount)} refunded via{' '}
              {refundMethod === 'cash' ? 'cash' : 'card'}
            </Text>
            <Text style={styles.doneOrder}>{order.orderNumber}</Text>
            <TouchableOpacity style={styles.doneButton} onPress={onClose}>
              <Text style={styles.doneButtonText}>Close</Text>
            </TouchableOpacity>
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
  headerRight: {
    alignItems: 'flex-end',
  },
  headerTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  // Center layout
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  refundSummaryText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },

  // Mode buttons
  modeButtons: {
    flexDirection: 'row',
    gap: 24,
  },
  modeButtonFull: {
    width: 200,
    height: 200,
    backgroundColor: '#8b5cf6',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modeButtonPartial: {
    width: 200,
    height: 200,
    backgroundColor: '#6366f1',
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
  modeButtonLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
  },
  modeButtonSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    textAlign: 'center',
  },

  // Items container
  itemsContainer: {
    flex: 1,
    padding: 20,
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemsHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  selectAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  itemsList: {
    flex: 1,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
  },
  itemRowSelected: {
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#8b5cf6',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  checkboxMark: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  // Custom amount
  customAmountSection: {
    marginBottom: 12,
  },
  customAmountToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  customAmountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
  },
  customAmountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  dollarSign: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginRight: 4,
  },
  customAmountInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    maxWidth: 200,
  },
  customAmountCap: {
    fontSize: 13,
    color: '#999',
    marginLeft: 8,
  },

  // Refund total
  refundTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginBottom: 12,
  },
  refundTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  refundTotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#8b5cf6',
  },

  // Reason input
  reasonInput: {
    width: '100%',
    maxWidth: 400,
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#1a1a1a',
    textAlignVertical: 'top',
    marginBottom: 24,
    backgroundColor: '#fff',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    maxWidth: 400,
  },
  cancelFooterButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
  },
  cancelFooterText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  proceedButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#8b5cf6',
    borderRadius: 10,
    alignItems: 'center',
  },
  proceedButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.3,
  },

  // PIN entry
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
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 240,
    justifyContent: 'center',
    marginBottom: 16,
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

  // Method selection
  approvedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16a34a',
    marginBottom: 20,
  },
  methodButtons: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  methodButton: {
    width: 160,
    height: 120,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  methodButtonActive: {
    backgroundColor: '#ede9fe',
    borderColor: '#8b5cf6',
  },
  methodButtonLabel: {
    fontSize: 24,
    fontWeight: '700',
    color: '#666',
  },
  methodButtonLabelActive: {
    color: '#8b5cf6',
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 4,
  },
  methodButtonTextActive: {
    color: '#8b5cf6',
  },
  methodButtonSub: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },

  // Confirmation box
  confirmBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  confirmDetail: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },

  // Refund button
  refundButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    alignItems: 'center',
  },
  refundButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  // Processing
  processingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginTop: 16,
  },
  processingAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: '#8b5cf6',
    marginTop: 8,
  },

  // Terminal processing
  terminalIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  terminalIcon: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  terminalDots: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  terminalDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6366f1',
  },
  terminalHint: {
    fontSize: 13,
    color: '#999',
  },

  // Terminal failure
  failCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  failIcon: {
    fontSize: 40,
    fontWeight: '700',
    color: '#fff',
  },
  failTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  failMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
    maxWidth: 320,
  },
  failPrompt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 20,
  },
  failButtons: {
    gap: 10,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  cashFallbackButton: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    alignItems: 'center',
  },
  cashFallbackText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  retryTerminalButton: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: '#6366f1',
    borderRadius: 10,
    alignItems: 'center',
  },
  retryTerminalText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  cancelFailButton: {
    paddingVertical: 10,
  },
  cancelFailText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },

  // Done
  doneCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#8b5cf6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  doneCheck: {
    fontSize: 40,
    color: '#fff',
    fontWeight: '700',
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  doneSummary: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  doneOrder: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
  },
  doneButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
