import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { TerminalStatus } from '../services';
import { getTerminalService } from '../services';
import { colors, spacing, radii, typography } from '../theme/tokens';

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
              <ActivityIndicator color={colors.primary} size="small" />
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
                <ActivityIndicator color={colors.primary} size="small" />
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
    padding: spacing.xxxl,
    backgroundColor: colors.surfaceAlt,
  },

  // Error icon
  errorCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorIcon: {
    fontSize: 40,
    fontWeight: typography.weight.bold,
    color: '#ef4444',
  },

  title: {
    fontSize: 26,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    fontSize: 17,
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: spacing.sm,
    maxWidth: 400,
  },
  amountText: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  retryCountText: {
    fontSize: typography.size.md,
    color: colors.textMuted,
    marginBottom: spacing.xl,
  },

  // Action buttons
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
  },
  retryButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  anotherMethodButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderRadius: radii.lg,
  },
  anotherMethodButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  cancelButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: '#ef4444',
  },

  // Terminal check
  terminalSection: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  checkTerminalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#eff6ff',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    minWidth: 140,
    alignItems: 'center',
  },
  checkTerminalText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  terminalStatusCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
    minWidth: 260,
  },
  terminalStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  terminalStatusLabel: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
  },
  terminalStatusValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
  },
  statusConnected: {
    color: colors.success,
  },
  statusDisconnected: {
    color: '#ef4444',
  },
  terminalStatusValueMono: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },

  // Support section
  supportSection: {
    alignItems: 'center',
    marginTop: spacing.sm,
    maxWidth: 400,
  },
  supportDivider: {
    width: 60,
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  supportTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  supportMessage: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
  },
});
