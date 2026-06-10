import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import { colors, spacing, radii, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomerResult {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  loyaltyTier: string | null;
}

interface CustomerSearchModalProps {
  visible: boolean;
  onSelect: (customer: CustomerResult) => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Quick-Add Form
// ---------------------------------------------------------------------------

function QuickAddForm({
  onCreated,
  onBack,
}: {
  onCreated: (c: CustomerResult) => void;
  onBack: () => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isValid = firstName.trim().length > 0 && phone.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!isValid || saving) return;
    setSaving(true);
    setError('');

    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const res = await fetch(`${API_URL}/customers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
        }),
      });

      if (res.status === 403) {
        setError("You don't have permission to add customers — ask a manager.");
        setSaving(false);
        return;
      }

      if (!res.ok) {
        let msg = "Couldn't add customer — try again.";
        try {
          const body = await res.json();
          if (body.message) msg = body.message;
        } catch {
          /* ignore parse failure */
        }
        setError(msg);
        setSaving(false);
        return;
      }

      const created = await res.json();
      onCreated({
        id: created.id,
        firstName: created.firstName,
        lastName: created.lastName,
        phone: created.phone ?? '',
        email: created.email ?? '',
        loyaltyTier: null,
      });
    } catch {
      setError("Couldn't add customer — try again.");
      setSaving(false);
    }
  }, [firstName, lastName, phone, email, isValid, saving, onCreated]);

  return (
    <View style={styles.formContainer}>
      <View style={styles.formHeader}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.formTitle}>New Customer</Text>
        <View style={styles.backPlaceholder} />
      </View>

      <View style={styles.formFields}>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>First Name *</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="First name"
            placeholderTextColor={colors.textMuted}
            value={firstName}
            onChangeText={setFirstName}
            autoFocus
          />
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Last Name</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="Last name"
            placeholderTextColor={colors.textMuted}
            value={lastName}
            onChangeText={setLastName}
          />
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Phone *</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="Phone number"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="Email address"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </View>
      </View>

      {error !== '' && <Text style={styles.formError}>{error}</Text>}

      <TouchableOpacity
        style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!isValid || saving}
      >
        {saving ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={styles.saveButtonText}>Add Customer</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// CustomerSearchModal
// ---------------------------------------------------------------------------

export function CustomerSearchModal({ visible, onSelect, onCancel }: CustomerSearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setFetchError('');
      setShowQuickAdd(false);
    }
  }, [visible]);

  // Search customers via HTTP (debounced)
  useEffect(() => {
    if (!visible || showQuickAdd) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setFetchError('');
      try {
        const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        const trimmed = query.trim();
        const url = trimmed
          ? `${API_URL}/customers?search=${encodeURIComponent(trimmed)}&limit=50`
          : `${API_URL}/customers?limit=50`;

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const rows = data.data ?? [];
        setResults(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rows.map((c: any) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            phone: c.phone ?? '',
            email: c.email ?? '',
            loyaltyTier: null,
          })),
        );
      } catch {
        setFetchError("Couldn't load customers — check connection");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible, showQuickAdd]);

  const handleCreated = useCallback(
    (customer: CustomerResult) => {
      onSelect(customer);
    },
    [onSelect],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      supportedOrientations={['landscape-left', 'landscape-right']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {showQuickAdd ? (
            <QuickAddForm onCreated={handleCreated} onBack={() => setShowQuickAdd(false)} />
          ) : (
            <>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Find Customer</Text>
                <TouchableOpacity onPress={onCancel}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>

              {/* Search input */}
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by name, phone, or email..."
                  placeholderTextColor={colors.textMuted}
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                />
              </View>

              {/* Results */}
              <ScrollView
                style={styles.resultsList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {fetchError !== '' && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{fetchError}</Text>
                  </View>
                )}
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.textMuted} />
                  </View>
                ) : results.length === 0 && fetchError === '' ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                      {query.trim() ? 'No customers found' : 'No customers yet'}
                    </Text>
                  </View>
                ) : (
                  results.map((customer) => {
                    const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ');
                    return (
                      <TouchableOpacity
                        key={customer.id}
                        style={styles.resultRow}
                        onPress={() => onSelect(customer)}
                        activeOpacity={0.6}
                      >
                        <View style={styles.resultInfo}>
                          <Text style={styles.resultName}>{name}</Text>
                          {customer.phone !== '' && (
                            <Text style={styles.resultDetail}>{customer.phone}</Text>
                          )}
                          {customer.email !== '' && (
                            <Text style={styles.resultDetail}>{customer.email}</Text>
                          )}
                        </View>
                        {customer.loyaltyTier && (
                          <View style={styles.loyaltyBadge}>
                            <Text style={styles.loyaltyText}>{customer.loyaltyTier}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>

              {/* Quick-add button */}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.quickAddButton}
                  onPress={() => setShowQuickAdd(true)}
                >
                  <Text style={styles.quickAddText}>+ Add New Customer</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '70%',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },

  // Search
  searchRow: {
    paddingHorizontal: 20,
    paddingBottom: spacing.md,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.base,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
  },

  // Results
  resultsList: {
    maxHeight: 320,
  },
  loadingContainer: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textMuted,
  },
  errorContainer: {
    paddingHorizontal: 20,
    paddingVertical: spacing.sm,
  },
  errorText: {
    fontSize: typography.size.sm,
    color: colors.danger,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  resultDetail: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  loyaltyBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: spacing.sm,
  },
  loyaltyText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: '#92400e',
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  quickAddButton: {
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  quickAddText: {
    fontSize: 15,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },

  // Quick-add form
  formContainer: {
    paddingBottom: 20,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: spacing.md,
  },
  backText: {
    fontSize: 15,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  formTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  backPlaceholder: {
    width: 40,
  },
  formFields: {
    paddingHorizontal: 20,
    gap: spacing.md,
  },
  fieldRow: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  fieldInput: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.base,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
  },
  formError: {
    fontSize: typography.size.sm,
    color: colors.danger,
    marginHorizontal: 20,
    marginTop: spacing.sm,
  },
  saveButton: {
    marginHorizontal: 20,
    marginTop: spacing.lg,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: colors.textDisabled,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
});
