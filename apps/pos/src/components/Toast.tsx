import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react-native';
import { colors, spacing, radii, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

const VARIANT_BG: Record<ToastVariant, string> = {
  success: colors.success,
  error: colors.danger,
  info: colors.primary,
  warning: colors.warning,
};

const VARIANT_ICON = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
} as const;

function ToastOverlay({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    const duration = toast.variant === 'error' ? 5000 : 3000;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
      ]).start(onDone);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast, opacity, translateY, onDone]);

  const Icon = VARIANT_ICON[toast.variant];

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: VARIANT_BG[toast.variant], opacity, transform: [{ translateY }] },
      ]}
      pointerEvents="none"
    >
      <Icon size={18} color={colors.white} />
      <Text style={styles.toastText}>{toast.message}</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, variant: ToastVariant) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, variant }]);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value: ToastContextValue = {
    success: useCallback((m: string) => push(m, 'success'), [push]),
    error: useCallback((m: string) => push(m, 'error'), [push]),
    info: useCallback((m: string) => push(m, 'info'), [push]),
    warning: useCallback((m: string) => push(m, 'warning'), [push]),
  };

  const current = toasts[0] ?? null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && (
        <View style={styles.overlay} pointerEvents="box-none">
          <ToastOverlay key={current.id} toast={current} onDone={() => remove(current.id)} />
        </View>
      )}
    </ToastContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    paddingTop: spacing.lg,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    gap: spacing.sm,
    maxWidth: 400,
  },
  toastText: {
    color: colors.white,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    flexShrink: 1,
  },
});
