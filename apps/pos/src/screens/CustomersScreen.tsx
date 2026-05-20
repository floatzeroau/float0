import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { WifiOff, X, ChevronRight, ArrowLeft } from 'lucide-react-native';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import { ServeFromPackModal } from '../components/ServeFromPackModal';
import { colors, spacing, radii, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomerListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  activePackCount: number;
}

interface CustomerPack {
  id: string;
  productName: string;
  totalQuantity: number;
  remainingQuantity: number;
  pricePaid: number;
  expiryDate: string | null;
  status: string;
  createdAt: string;
}

interface CustomerOrder {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  createdAt: string;
  itemCount: number;
}

interface CustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  loyaltyTier: string | null;
  loyaltyBalance: number;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Offline Placeholder
// ---------------------------------------------------------------------------

function OfflinePlaceholder() {
  return (
    <View style={styles.offlinePlaceholder}>
      <WifiOff size={48} color={colors.textMuted} />
      <Text style={styles.offlineTitle}>Connect to the internet</Text>
      <Text style={styles.offlineSubtitle}>
        Customer data requires an active connection to load.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Customer Detail View
// ---------------------------------------------------------------------------

interface CustomerDetailViewProps {
  customerId: string;
  onBack: () => void;
  onServeFromPack: (customerId: string, customerName: string) => void;
}

function CustomerDetailView({ customerId, onBack, onServeFromPack }: CustomerDetailViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'packs' | 'history'>('overview');
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [packs, setPacks] = useState<CustomerPack[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        const headers = { Authorization: `Bearer ${token}` };

        const [detailRes, packsRes, ordersRes] = await Promise.all([
          fetch(`${API_URL}/customers/${customerId}`, { headers }),
          fetch(`${API_URL}/customers/${customerId}/packs`, { headers }),
          fetch(`${API_URL}/customers/${customerId}/orders?limit=20`, { headers }),
        ]);

        if (cancelled) return;

        if (detailRes.ok) {
          setDetail(await detailRes.json());
        }
        if (packsRes.ok) {
          const data = await packsRes.json();
          setPacks(Array.isArray(data) ? data : (data.packs ?? []));
        }
        if (ordersRes.ok) {
          const data = await ordersRes.json();
          setOrders(Array.isArray(data) ? data : (data.orders ?? []));
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Could not load customer details.</Text>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const customerName = `${detail.firstName} ${detail.lastName}`;

  return (
    <View style={styles.detailContainer}>
      {/* Header */}
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft size={16} color={colors.primary} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.detailHeaderInfo}>
          <Text style={styles.detailName}>{customerName}</Text>
          {detail.email && <Text style={styles.detailSub}>{detail.email}</Text>}
          {detail.phone && <Text style={styles.detailSub}>{detail.phone}</Text>}
        </View>
        <TouchableOpacity
          style={styles.serveButton}
          onPress={() => onServeFromPack(customerId, customerName)}
        >
          <Text style={styles.serveButtonText}>Serve from Pack</Text>
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['overview', 'packs', 'history'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'overview' ? 'Overview' : tab === 'packs' ? 'Packs' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <View style={styles.tabContent}>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Name</Text>
            <Text style={styles.overviewValue}>{customerName}</Text>
          </View>
          {detail.email && (
            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Email</Text>
              <Text style={styles.overviewValue}>{detail.email}</Text>
            </View>
          )}
          {detail.phone && (
            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Phone</Text>
              <Text style={styles.overviewValue}>{detail.phone}</Text>
            </View>
          )}
          {detail.loyaltyTier && (
            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Loyalty Tier</Text>
              <Text style={styles.overviewValue}>{detail.loyaltyTier}</Text>
            </View>
          )}
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Loyalty Balance</Text>
            <Text style={styles.overviewValue}>${detail.loyaltyBalance.toFixed(2)}</Text>
          </View>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Active Packs</Text>
            <Text style={styles.overviewValue}>
              {packs.filter((p) => p.status === 'active').length}
            </Text>
          </View>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Customer Since</Text>
            <Text style={styles.overviewValue}>
              {new Date(detail.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </View>
      )}

      {activeTab === 'packs' && (
        <FlatList
          data={packs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyTab}>
              <Text style={styles.emptyTabText}>No packs found</Text>
            </View>
          }
          renderItem={({ item: pack }) => {
            const isExpired = pack.expiryDate && new Date(pack.expiryDate) < new Date();
            const isActive = pack.status === 'active' && !isExpired;
            return (
              <View style={[styles.packCard, !isActive && styles.packCardInactive]}>
                <View style={styles.packCardHeader}>
                  <Text style={[styles.packProductName, !isActive && styles.packTextMuted]}>
                    {pack.productName}
                  </Text>
                  <View
                    style={[
                      styles.packStatusBadge,
                      isActive ? styles.packStatusActive : styles.packStatusInactive,
                    ]}
                  >
                    <Text style={styles.packStatusText}>
                      {isExpired ? 'EXPIRED' : pack.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.packCardBody}>
                  <Text style={[styles.packDetail, !isActive && styles.packTextMuted]}>
                    Remaining: {pack.remainingQuantity}/{pack.totalQuantity}
                  </Text>
                  <Text style={[styles.packDetail, !isActive && styles.packTextMuted]}>
                    Paid: ${pack.pricePaid.toFixed(2)}
                  </Text>
                  {pack.expiryDate && (
                    <Text style={[styles.packDetail, isExpired && styles.packExpiredText]}>
                      Expires: {new Date(pack.expiryDate).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {activeTab === 'history' && (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyTab}>
              <Text style={styles.emptyTabText}>No order history</Text>
            </View>
          }
          renderItem={({ item: order }) => (
            <View style={styles.orderCard}>
              <View style={styles.orderCardHeader}>
                <Text style={styles.orderNumber}>{order.orderNumber}</Text>
                <Text style={styles.orderTotal}>${order.total.toFixed(2)}</Text>
              </View>
              <View style={styles.orderCardBody}>
                <Text style={styles.orderDetail}>
                  {order.itemCount} item{order.itemCount !== 1 ? 's' : ''} · {order.status}
                </Text>
                <Text style={styles.orderDate}>
                  {new Date(order.createdAt).toLocaleDateString()}{' '}
                  {new Date(order.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// CustomersScreen (main export)
// ---------------------------------------------------------------------------

export default function CustomersScreen() {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [serveModalVisible, setServeModalVisible] = useState(false);
  const [serveCustomerId, setServeCustomerId] = useState<string | null>(null);
  const [serveCustomerName, setServeCustomerName] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCustomers = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const url = search
        ? `${API_URL}/customers?search=${encodeURIComponent(search)}&limit=50`
        : `${API_URL}/customers?limit=50`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : (data.data ?? []));
      setIsOnline(true);
    } catch {
      setIsOnline(false);
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchCustomers('');
  }, [fetchCustomers]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchCustomers(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchCustomers]);

  // Add Customer modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addFirstName, setAddFirstName] = useState('');
  const [addLastName, setAddLastName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [addFirstNameError, setAddFirstNameError] = useState('');

  const openAddModal = useCallback(() => {
    setAddFirstName('');
    setAddLastName('');
    setAddPhone('');
    setAddEmail('');
    setAddError('');
    setAddFirstNameError('');
    setAddSaving(false);
    setAddModalVisible(true);
  }, []);

  const handleAddCustomer = useCallback(async () => {
    const trimmedFirst = addFirstName.trim();
    if (!trimmedFirst) {
      setAddFirstNameError('First name is required');
      return;
    }
    setAddFirstNameError('');
    setAddError('');
    setAddSaving(true);
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const res = await fetch(`${API_URL}/customers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: trimmedFirst,
          lastName: addLastName.trim(),
          phone: addPhone.trim(),
          email: addEmail.trim(),
        }),
      });
      if (res.status === 403) {
        setAddError("You don't have permission to add customers — ask a manager.");
        setAddSaving(false);
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
        setAddError(msg);
        setAddSaving(false);
        return;
      }
      setAddModalVisible(false);
      fetchCustomers(query);
    } catch {
      setAddError("Couldn't add customer — try again.");
      setAddSaving(false);
    }
  }, [addFirstName, addLastName, addPhone, addEmail, fetchCustomers, query]);

  const handleServeFromPack = useCallback((customerId: string, customerName: string) => {
    setServeCustomerId(customerId);
    setServeCustomerName(customerName);
    setServeModalVisible(true);
  }, []);

  const handleServeComplete = useCallback(() => {
    setServeModalVisible(false);
    setServeCustomerId(null);
    // Refresh detail if viewing one
    if (selectedCustomerId) {
      setSelectedCustomerId(null);
      setTimeout(() => setSelectedCustomerId(selectedCustomerId), 50);
    }
  }, [selectedCustomerId]);

  // If offline, show placeholder
  if (!isOnline && customers.length === 0 && !loading) {
    return <OfflinePlaceholder />;
  }

  // Customer detail view
  if (selectedCustomerId) {
    return (
      <>
        <CustomerDetailView
          customerId={selectedCustomerId}
          onBack={() => setSelectedCustomerId(null)}
          onServeFromPack={handleServeFromPack}
        />
        {serveCustomerId && (
          <ServeFromPackModal
            visible={serveModalVisible}
            customerId={serveCustomerId}
            customerName={serveCustomerName}
            isServerId
            onComplete={handleServeComplete}
            onCancel={() => setServeModalVisible(false)}
          />
        )}
      </>
    );
  }

  // Customer list view
  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search customers..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={() => setQuery('')}>
            <X size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <Text style={styles.addButtonText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Add Customer Modal */}
      <Modal
        visible={addModalVisible}
        animationType="fade"
        transparent
        supportedOrientations={['landscape-left', 'landscape-right']}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>New Customer</Text>

            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>First Name *</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="First name"
                placeholderTextColor={colors.textMuted}
                value={addFirstName}
                onChangeText={(t) => {
                  setAddFirstName(t);
                  setAddFirstNameError('');
                }}
                autoFocus
              />
              {addFirstNameError !== '' && (
                <Text style={styles.modalFieldError}>{addFirstNameError}</Text>
              )}
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Last Name</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Last name"
                placeholderTextColor={colors.textMuted}
                value={addLastName}
                onChangeText={setAddLastName}
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Phone</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Phone number"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={addPhone}
                onChangeText={setAddPhone}
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Email</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Email address"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={addEmail}
                onChangeText={setAddEmail}
              />
            </View>

            {addError !== '' && <Text style={styles.modalError}>{addError}</Text>}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setAddModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, addSaving && styles.modalSubmitDisabled]}
                onPress={handleAddCustomer}
                disabled={addSaving}
              >
                {addSaving ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Add Customer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Customer list */}
      {loading && customers.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>
                {query ? 'No customers found' : 'No customers yet'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.customerRow}
              onPress={() => setSelectedCustomerId(item.id)}
            >
              <View style={styles.customerAvatar}>
                <Text style={styles.customerAvatarText}>
                  {item.firstName[0]}
                  {item.lastName[0]}
                </Text>
              </View>
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>
                  {item.firstName} {item.lastName}
                </Text>
                {item.email && <Text style={styles.customerEmail}>{item.email}</Text>}
                {item.phone && <Text style={styles.customerPhone}>{item.phone}</Text>}
              </View>
              {item.activePackCount > 0 && (
                <View style={styles.packBadge}>
                  <Text style={styles.packBadgeText}>
                    {item.activePackCount} pack{item.activePackCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              <ChevronRight size={20} color={colors.textDisabled} />
            </TouchableOpacity>
          )}
        />
      )}

      {serveCustomerId && (
        <ServeFromPackModal
          visible={serveModalVisible}
          customerId={serveCustomerId}
          customerName={serveCustomerName}
          onComplete={handleServeComplete}
          onCancel={() => setServeModalVisible(false)}
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
    backgroundColor: colors.surface,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: typography.size.base,
    color: colors.danger,
    marginBottom: spacing.md,
  },

  // Offline
  offlinePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.xxxl,
  },
  offlineTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  offlineSubtitle: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.base,
    color: colors.textPrimary,
  },
  clearButton: {
    marginLeft: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radii.xl,
    backgroundColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButton: {
    marginLeft: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  addButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.white,
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textMuted,
  },

  // Customer row
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  customerAvatarText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  customerEmail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  customerPhone: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 1,
  },
  packBadge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.lg,
    marginRight: spacing.sm,
  },
  packBadgeText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.success,
  },

  // Detail view
  detailContainer: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 6,
    paddingRight: spacing.sm,
  },
  backButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  detailHeaderInfo: {
    flex: 1,
  },
  detailName: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  detailSub: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
  },
  serveButton: {
    backgroundColor: colors.pack,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  serveButtonText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
  },
  tabContent: {
    flex: 1,
    padding: spacing.lg,
  },
  emptyTab: {
    padding: spacing.xxxl,
    alignItems: 'center',
  },
  emptyTabText: {
    fontSize: typography.size.base,
    color: colors.textMuted,
  },

  // Overview
  overviewCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  overviewLabel: {
    fontSize: typography.size.base,
    color: colors.textSecondary,
  },
  overviewValue: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },

  // Packs
  packCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: 14,
    backgroundColor: colors.packLight,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  packCardInactive: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  packCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  packProductName: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  packTextMuted: {
    color: colors.textMuted,
  },
  packStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.lg,
  },
  packStatusActive: {
    backgroundColor: '#dcfce7',
  },
  packStatusInactive: {
    backgroundColor: colors.borderLight,
  },
  packStatusText: {
    fontSize: typography.size.xxs,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  packCardBody: {
    gap: spacing.xs,
  },
  packDetail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  packExpiredText: {
    color: colors.danger,
    fontWeight: typography.weight.semibold,
  },

  // Orders
  orderCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: 14,
    backgroundColor: '#f9fafb',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  orderNumber: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  orderTotal: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  orderCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderDetail: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  orderDate: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },

  // Add Customer Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: 360,
  },
  modalTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  modalField: {
    marginBottom: spacing.md,
  },
  modalLabel: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  modalInput: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.base,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
  },
  modalFieldError: {
    fontSize: typography.size.sm,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  modalError: {
    fontSize: typography.size.sm,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalCancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.borderLight,
  },
  modalCancelText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  modalSubmitButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.primary,
  },
  modalSubmitDisabled: {
    backgroundColor: colors.textDisabled,
  },
  modalSubmitText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
});
