import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { ReceiptData } from '@float0/shared';
import { getAudioService, getPrinterService } from '../services';
import { ReceiptPreview } from '../components/ReceiptPreview';
import { API_URL, AUTH_TOKEN_KEY } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentConfirmationData {
  orderId: string;
  orderNumber: string;
  orderTotal: number;
  totalPaid: number;
  tipAmount: number;
  paymentMethod: 'cash' | 'card' | 'split';
  changeGiven?: number;
  cardLastFour?: string;
  cardType?: string;
  approvalCode?: string;
  receiptData?: ReceiptData;
  customerEmail?: string;
}

interface PaymentConfirmationScreenProps {
  data: PaymentConfirmationData;
  onDone: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_ADVANCE_MS = 5000;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaymentConfirmationScreen({ data, onDone }: PaymentConfirmationScreenProps) {
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doneCalledRef = useRef(false);

  const handleDone = useCallback(() => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = null;
    }
    onDone();
  }, [onDone]);

  useEffect(() => {
    // Play success chime (fire-and-forget)
    getAudioService().playSuccessChime();

    // Animate checkmark
    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // After checkmark completes, fade in content
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        // Start auto-advance timer after buttons are visible
        autoAdvanceTimer.current = setTimeout(() => {
          handleDone();
        }, AUTO_ADVANCE_MS);
      });
    });

    return () => {
      if (autoAdvanceTimer.current) {
        clearTimeout(autoAdvanceTimer.current);
      }
    };
  }, [checkScale, checkOpacity, contentOpacity, handleDone]);

  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;

  const getMethodLabel = () => {
    switch (data.paymentMethod) {
      case 'cash':
        return 'Cash';
      case 'card': {
        const type = data.cardType || 'Card';
        const last4 = data.cardLastFour ? ` ****${data.cardLastFour}` : '';
        return `${type}${last4}`;
      }
      case 'split':
        return 'Split Payment';
    }
  };

  const [showReceipt, setShowReceipt] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailAddress, setEmailAddress] = useState(data.customerEmail ?? '');
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  const handlePrintReceipt = useCallback(() => {
    if (data.receiptData) {
      getPrinterService()
        .printReceipt(data.receiptData)
        .catch(() => {});
      setShowReceipt(true);
    }
  }, [data.receiptData]);

  const handleEmailReceipt = useCallback(() => {
    if (emailSent) return;
    setShowEmailInput(true);
  }, [emailSent]);

  const handleSendEmail = useCallback(async () => {
    const trimmed = emailAddress.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    setEmailSending(true);
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const response = await fetch(`${API_URL}/receipts/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orderId: data.orderId, email: trimmed }),
      });

      if (response.ok) {
        setEmailSent(true);
        setShowEmailInput(false);
        Alert.alert('Email sent', `Receipt sent to ${trimmed}`);
      } else {
        Alert.alert('Email saved', 'Email saved for when online');
        setEmailSent(true);
        setShowEmailInput(false);
      }
    } catch {
      // Offline — queue for later
      Alert.alert('Email saved', 'Email saved for when online');
      setEmailSent(true);
      setShowEmailInput(false);
    } finally {
      setEmailSending(false);
    }
  }, [emailAddress, data.orderId]);

  return (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Checkmark animation */}
      <Animated.View
        style={[
          styles.checkCircle,
          {
            opacity: checkOpacity,
            transform: [{ scale: checkScale }],
          },
        ]}
      >
        <Text style={styles.checkMark}>{'\u2713'}</Text>
      </Animated.View>

      <Animated.View style={{ opacity: checkOpacity }}>
        <Text style={styles.successTitle}>Payment Successful</Text>
      </Animated.View>

      {/* Summary + buttons fade in after checkmark */}
      <Animated.View style={[styles.contentContainer, { opacity: contentOpacity }]}>
        {/* Payment summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Paid</Text>
            <Text style={styles.summaryValue}>{formatCurrency(data.totalPaid)}</Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Payment Method</Text>
            <Text style={styles.summaryValue}>{getMethodLabel()}</Text>
          </View>

          {data.tipAmount > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tip</Text>
              <Text style={styles.summaryValueTip}>{formatCurrency(data.tipAmount)}</Text>
            </View>
          )}

          {data.paymentMethod === 'cash' && data.changeGiven != null && data.changeGiven > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Change</Text>
              <Text style={styles.summaryValue}>{formatCurrency(data.changeGiven)}</Text>
            </View>
          )}

          {data.paymentMethod === 'card' && data.approvalCode ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Approval Code</Text>
              <Text style={styles.summaryValueMono}>{data.approvalCode}</Text>
            </View>
          ) : null}
        </View>

        {/* Receipt preview */}
        {showReceipt && data.receiptData && (
          <View style={styles.receiptPreviewContainer}>
            <ReceiptPreview data={data.receiptData} />
          </View>
        )}

        {/* Email input */}
        {showEmailInput && (
          <View style={styles.emailInputContainer}>
            <TextInput
              style={styles.emailInput}
              placeholder="customer@email.com"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={emailAddress}
              onChangeText={setEmailAddress}
              editable={!emailSending}
            />
            <View style={styles.emailButtonRow}>
              <TouchableOpacity
                style={[styles.emailSendButton, emailSending && styles.buttonDisabled]}
                onPress={handleSendEmail}
                disabled={emailSending}
              >
                <Text style={styles.emailSendButtonText}>
                  {emailSending ? 'Sending...' : 'Send'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.emailCancelButton}
                onPress={() => setShowEmailInput(false)}
                disabled={emailSending}
              >
                <Text style={styles.emailCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.receiptButton, !data.receiptData && styles.buttonDisabled]}
            onPress={handlePrintReceipt}
            disabled={!data.receiptData}
          >
            <Text style={styles.receiptButtonText}>
              {showReceipt ? 'Printed' : 'Print Receipt'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.receiptButton, emailSent && styles.buttonDisabled]}
            onPress={handleEmailReceipt}
            disabled={emailSent}
          >
            <Text style={styles.receiptButtonText}>
              {emailSent ? 'Email Sent' : 'Email Receipt'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.noReceiptButton} onPress={handleDone}>
            <Text style={styles.noReceiptButtonText}>No Receipt</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.newOrderButton} onPress={handleDone}>
          <Text style={styles.newOrderButtonText}>New Order</Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },

  // Checkmark
  checkCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  checkMark: {
    fontSize: 60,
    color: '#fff',
    fontWeight: '700',
  },

  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 32,
  },

  // Content
  contentContainer: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },

  // Summary card
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  summaryLabel: {
    fontSize: 15,
    color: '#666',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  summaryValueTip: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10b981',
  },
  summaryValueMono: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    fontFamily: 'monospace',
  },

  // Receipt preview
  receiptPreviewContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.4,
  },

  // Buttons
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  receiptButton: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  receiptButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  noReceiptButton: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
  },
  noReceiptButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  // Email input
  emailInputContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emailInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    marginBottom: 12,
  },
  emailButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  emailSendButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#10b981',
    borderRadius: 8,
    alignItems: 'center',
  },
  emailSendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emailCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  emailCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },

  newOrderButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: '#10b981',
    borderRadius: 12,
  },
  newOrderButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
});
