import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { TerminalStatus } from '../services';
import { getTerminalService } from '../services';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentFailureScreenProps {
  errorMessage: string;
  amount: number;
  retryCount: number;
  isTimeout: boolean;
  onRetry: () => void;
  onTryAnotherMethod: () => void;
  onCancelPayment: () => void;
}

const MAX_RETRIES_BEFORE_SUPPORT = 3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PaymentFailureScreen({
  errorMessage,
  amount,
  retryCount,
  isTimeout,
  onRetry,
  onTryAnotherMethod,
  onCancelPayment,
}: PaymentFailureScreenProps) {
  const [checkingTerminal, setCheckingTerminal] = useState(false);
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus | null>(null);

  const showSupportOption = retryCount >= MAX_RETRIES_BEFORE_SUPPORT;
  const formatCurrency = (val: number) => `$${val.toFixed(2)}`;

  const handleCheckTerminal = useCallback(async () => {
    setCheckingTerminal(true);
    try {
      const terminal = getTerminalService();
      const status = await terminal.getStatus();
      setTerminalStatus(status);
    } catch {
      setTerminalStatus({ connected: false });
    } finally {
      setCheckingTerminal(false);
    }
  }, []);

  return (
    <View style={styles.container}>
      {/* Error icon */}
      <View style={styles.errorCircle}>
        <Text style={styles.errorIcon}>!</Text>
      </View>

      <Text style={styles.title}>Payment Failed</Text>
      <Text style={styles.errorMessage}>{errorMessage}</Text>
      <Text style={styles.amountText}>Amount: {formatCurrency(amount)}</Text>

      {retryCount > 0 && (
        <Text style={styles.retryCountText}>
          {retryCount} failed {retryCount === 1 ? 'attempt' : 'attempts'}
        </Text>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.anotherMethodButton} onPress={onTryAnotherMethod}>
          <Text style={styles.anotherMethodButtonText}>Try Another Method</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelButton} onPress={onCancelPayment}>
          <Text style={styles.cancelButtonText}>Cancel Payment</Text>
        </TouchableOpacity>
      </View>

      {/* Timeout: Check Terminal */}
      {isTimeout && (
        <View style={styles.terminalSection}>
          <TouchableOpacity
            style={styles.checkTerminalButton}
            onPress={handleCheckTerminal}
            disabled={checkingTerminal}
          >
            {checkingTerminal ? (
              <ActivityIndicator color="#2563eb" size="small" />
            ) : (
              <Text style={styles.checkTerminalText}>Check Terminal</Text>
            )}
          </TouchableOpacity>

          {terminalStatus && (
            <View style={styles.terminalStatusCard}>
              <View style={styles.terminalStatusRow}>
                <Text style={styles.terminalStatusLabel}>Status</Text>
                <Text
                  style={[
                    styles.terminalStatusValue,
                    terminalStatus.connected ? styles.statusConnected : styles.statusDisconnected,
                  ]}
                >
                  {terminalStatus.connected ? 'Connected' : 'Disconnected'}
                </Text>
              </View>
              {terminalStatus.terminalId && (
                <View style={styles.terminalStatusRow}>
                  <Text style={styles.terminalStatusLabel}>Terminal ID</Text>
                  <Text style={styles.terminalStatusValueMono}>{terminalStatus.terminalId}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* Contact support after repeated failures */}
      {showSupportOption && (
        <View style={styles.supportSection}>
          <View style={styles.supportDivider} />
          <Text style={styles.supportTitle}>Still having issues?</Text>
          <Text style={styles.supportMessage}>
            The terminal has failed {retryCount} times. Try power-cycling the terminal or contact
            support for assistance.
          </Text>
          {!terminalStatus && (
            <TouchableOpacity
              style={styles.checkTerminalButton}
              onPress={handleCheckTerminal}
              disabled={checkingTerminal}
            >
              {checkingTerminal ? (
                <ActivityIndicator color="#2563eb" size="small" />
              ) : (
                <Text style={styles.checkTerminalText}>Check Terminal Status</Text>
              )}
            </TouchableOpacity>
          )}
          {terminalStatus && (
            <View style={styles.terminalStatusCard}>
              <View style={styles.terminalStatusRow}>
                <Text style={styles.terminalStatusLabel}>Status</Text>
                <Text
                  style={[
                    styles.terminalStatusValue,
                    terminalStatus.connected ? styles.statusConnected : styles.statusDisconnected,
                  ]}
                >
                  {terminalStatus.connected ? 'Connected' : 'Disconnected'}
                </Text>
              </View>
              {terminalStatus.terminalId && (
                <View style={styles.terminalStatusRow}>
                  <Text style={styles.terminalStatusLabel}>Terminal ID</Text>
                  <Text style={styles.terminalStatusValueMono}>{terminalStatus.terminalId}</Text>
                </View>
              )}
            </View>
          )}
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#f5f5f5',
  },

  // Error icon
  errorCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 40,
    fontWeight: '700',
    color: '#ef4444',
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 17,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 8,
    maxWidth: 400,
  },
  amountText: {
    fontSize: 15,
    color: '#666',
    marginBottom: 4,
  },
  retryCountText: {
    fontSize: 13,
    color: '#999',
    marginBottom: 24,
  },

  // Action buttons
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 16,
  },
  retryButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: '#2563eb',
    borderRadius: 10,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  anotherMethodButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
  },
  anotherMethodButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
  },

  // Terminal check
  terminalSection: {
    alignItems: 'center',
    marginTop: 8,
  },
  checkTerminalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    minWidth: 140,
    alignItems: 'center',
  },
  checkTerminalText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  terminalStatusCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    marginTop: 12,
    minWidth: 260,
  },
  terminalStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  terminalStatusLabel: {
    fontSize: 14,
    color: '#666',
  },
  terminalStatusValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  statusConnected: {
    color: '#10b981',
  },
  statusDisconnected: {
    color: '#ef4444',
  },
  terminalStatusValueMono: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    fontFamily: 'monospace',
  },

  // Support section
  supportSection: {
    alignItems: 'center',
    marginTop: 8,
    maxWidth: 400,
  },
  supportDivider: {
    width: 60,
    height: 1,
    backgroundColor: '#e0e0e0',
    marginBottom: 16,
  },
  supportTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  supportMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
});
