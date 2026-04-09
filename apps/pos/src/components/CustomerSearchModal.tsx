import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Customer } from '../db/models';

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
// Helpers
// ---------------------------------------------------------------------------

function setRaw(record: Customer, field: string, value: string | number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (record._raw as any)[field] = value;
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

  const isValid = firstName.trim().length > 0 && phone.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!isValid || saving) return;
    setSaving(true);

    try {
      await database.write(async () => {
        const created = await database.get<Customer>('customers').create((c) => {
          setRaw(c, 'server_id', crypto.randomUUID());
          setRaw(c, 'first_name', firstName.trim());
          setRaw(c, 'last_name', lastName.trim());
          setRaw(c, 'phone', phone.trim());
          setRaw(c, 'email', email.trim());
          setRaw(c, 'loyalty_tier', '');
          setRaw(c, 'loyalty_balance', 0);
        });

        onCreated({
          id: created.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          loyaltyTier: null,
        });
      });
    } catch {
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
            placeholderTextColor="#999"
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
            placeholderTextColor="#999"
            value={lastName}
            onChangeText={setLastName}
          />
        </View>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Phone *</Text>
          <TextInput
            style={styles.fieldInput}
            placeholder="Phone number"
            placeholderTextColor="#999"
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
            placeholderTextColor="#999"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!isValid || saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
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
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setShowQuickAdd(false);
    }
  }, [visible]);

  // Search customers
  useEffect(() => {
    if (!visible || showQuickAdd) return;

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      // Show all customers when no query
      setLoading(true);
      database
        .get<Customer>('customers')
        .query()
        .fetch()
        .then((rows) => {
          setResults(
            rows.map((c) => ({
              id: c.id,
              firstName: c.firstName,
              lastName: c.lastName,
              phone: c.phone ?? '',
              email: c.email ?? '',
              loyaltyTier: c.loyaltyTier || null,
            })),
          );
          setLoading(false);
        });
      return;
    }

    setLoading(true);
    const lowerQ = trimmed.toLowerCase();

    database
      .get<Customer>('customers')
      .query(
        Q.or(
          Q.where('first_name', Q.like(`%${Q.sanitizeLikeString(lowerQ)}%`)),
          Q.where('last_name', Q.like(`%${Q.sanitizeLikeString(lowerQ)}%`)),
          Q.where('phone', Q.like(`%${Q.sanitizeLikeString(lowerQ)}%`)),
          Q.where('email', Q.like(`%${Q.sanitizeLikeString(lowerQ)}%`)),
        ),
      )
      .fetch()
      .then((rows) => {
        setResults(
          rows.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            phone: c.phone ?? '',
            email: c.email ?? '',
            loyaltyTier: c.loyaltyTier || null,
          })),
        );
        setLoading(false);
      });
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
      <View style={styles.overlay}>
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
                  placeholderTextColor="#999"
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                />
              </View>

              {/* Results */}
              <ScrollView style={styles.resultsList} showsVerticalScrollIndicator={false}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#999" />
                  </View>
                ) : results.length === 0 ? (
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
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },

  // Search
  searchRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },

  // Results
  resultsList: {
    maxHeight: 320,
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  resultDetail: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  loyaltyBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
  },
  loyaltyText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#92400e',
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  quickAddButton: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  quickAddText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
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
    paddingBottom: 12,
  },
  backText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  backPlaceholder: {
    width: 40,
  },
  formFields: {
    paddingHorizontal: 20,
    gap: 12,
  },
  fieldRow: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  fieldInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
  },
  saveButton: {
    marginHorizontal: 20,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
