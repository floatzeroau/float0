import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import { ServeFromPackModal } from '../components/ServeFromPackModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomerListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  activePacks: number;
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
      <Text style={styles.offlineIcon}>📡</Text>
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
        <ActivityIndicator size="large" color="#2563eb" />
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
          <Text style={styles.backButtonText}>← Back</Text>
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
      setCustomers(Array.isArray(data) ? data : (data.customers ?? []));
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
          placeholderTextColor="#999"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={() => setQuery('')}>
            <Text style={styles.clearButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Customer list */}
      {loading && customers.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
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
              {item.activePacks > 0 && (
                <View style={styles.packBadge}>
                  <Text style={styles.packBadgeText}>
                    {item.activePacks} pack{item.activePacks !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              <Text style={styles.chevron}>›</Text>
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
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    marginBottom: 12,
  },

  // Offline
  offlinePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 40,
  },
  offlineIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  offlineTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  offlineSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1a1a1a',
  },
  clearButton: {
    marginLeft: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 14,
    color: '#666',
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },

  // Customer row
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  customerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4338ca',
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  customerEmail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  customerPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 1,
  },
  packBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  packBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  chevron: {
    fontSize: 20,
    color: '#ccc',
  },

  // Detail view
  detailContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 12,
  },
  backButton: {
    paddingVertical: 6,
    paddingRight: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  detailHeaderInfo: {
    flex: 1,
  },
  detailName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  detailSub: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  serveButton: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  serveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#2563eb',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#2563eb',
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  emptyTab: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTabText: {
    fontSize: 14,
    color: '#999',
  },

  // Overview
  overviewCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  overviewLabel: {
    fontSize: 14,
    color: '#666',
  },
  overviewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },

  // Packs
  packCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: '#faf5ff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  packCardInactive: {
    backgroundColor: '#f5f5f5',
    borderColor: '#e0e0e0',
  },
  packCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  packProductName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  packTextMuted: {
    color: '#999',
  },
  packStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  packStatusActive: {
    backgroundColor: '#dcfce7',
  },
  packStatusInactive: {
    backgroundColor: '#f0f0f0',
  },
  packStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  packCardBody: {
    gap: 4,
  },
  packDetail: {
    fontSize: 12,
    color: '#666',
  },
  packExpiredText: {
    color: '#dc2626',
    fontWeight: '600',
  },

  // Orders
  orderCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  orderNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  orderTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  orderCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderDetail: {
    fontSize: 12,
    color: '#666',
  },
  orderDate: {
    fontSize: 12,
    color: '#999',
  },
});
