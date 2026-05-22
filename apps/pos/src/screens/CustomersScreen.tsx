import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Animated,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  WifiOff,
  X,
  ChevronRight,
  ArrowLeft,
  CheckCircle,
  Minus,
  Plus,
  ShoppingBag,
  Package,
  Coffee,
  RotateCcw,
  Settings,
} from 'lucide-react-native';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import { useToast } from '../components/Toast';
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
  totalSpent: number;
  visitCount: number;
  lastVisit: string | null;
  createdAt: string;
}

interface PackTransaction {
  id: string;
  type: 'pack_purchase' | 'pack_serve' | 'pack_refund' | 'pack_adjust';
  description: string;
  quantity: number;
  createdAt: string;
  packProductName?: string;
}

interface TimelineEntry {
  id: string;
  kind: 'order' | 'pack_purchase' | 'pack_serve' | 'pack_refund' | 'pack_adjust';
  title: string;
  subtitle: string;
  timestamp: string;
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
// Serve Confirmation Modal (single-pack, animated)
// ---------------------------------------------------------------------------

interface ServeConfirmationProps {
  visible: boolean;
  pack: CustomerPack | null;
  customerId: string;
  onComplete: () => void;
  onCancel: () => void;
}

function ServeConfirmationModal({
  visible,
  pack,
  customerId,
  onComplete,
  onCancel,
}: ServeConfirmationProps) {
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);
  const [serving, setServing] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setQuantity(1);
      setServing(false);
      setShowCheck(false);
      progress.setValue(0);
      checkOpacity.setValue(0);
    }
  }, [visible, progress, checkOpacity]);

  const handleServe = useCallback(async () => {
    if (!pack || serving) return;
    setServing(true);
    progress.setValue(0);

    Animated.timing(progress, {
      toValue: 1,
      duration: 2000,
      useNativeDriver: false,
    }).start();

    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const serveBody = { quantityServed: quantity };
      if (__DEV__) console.log('[Serve] POST body', serveBody);

      const [res] = await Promise.all([
        fetch(`${API_URL}/customers/${customerId}/packs/${pack.id}/serve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(serveBody),
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);

      if (!(res as Response).ok) throw new Error(`HTTP ${(res as Response).status}`);

      setShowCheck(true);
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => {
          toast.success(`Served ${quantity} × ${pack.productName}`);
          onComplete();
        }, 200);
      });
    } catch {
      toast.error("Couldn't serve from pack — try again");
      onCancel();
    }
  }, [pack, serving, quantity, customerId, progress, checkOpacity, toast, onComplete, onCancel]);

  if (!pack) return null;

  const maxQty = pack.remainingQuantity;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      supportedOrientations={['landscape-left', 'landscape-right']}
    >
      <View style={serveStyles.overlay}>
        <View style={serveStyles.sheet}>
          <TouchableOpacity style={serveStyles.cancelLink} onPress={onCancel} disabled={serving}>
            <X size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={serveStyles.packSummary}>
            <Text style={serveStyles.packName}>{pack.productName}</Text>
            <Text style={serveStyles.packRemaining}>
              {pack.remainingQuantity} / {pack.totalQuantity} remaining
            </Text>
          </View>

          <View style={serveStyles.stepperRow}>
            <TouchableOpacity
              style={[serveStyles.stepperBtn, quantity <= 1 && serveStyles.stepperBtnDisabled]}
              onPress={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1 || serving}
            >
              <Minus size={20} color={quantity <= 1 ? colors.textDisabled : colors.textPrimary} />
            </TouchableOpacity>
            <Text style={serveStyles.stepperValue}>{quantity}</Text>
            <TouchableOpacity
              style={[serveStyles.stepperBtn, quantity >= maxQty && serveStyles.stepperBtnDisabled]}
              onPress={() => setQuantity((q) => Math.min(maxQty, q + 1))}
              disabled={quantity >= maxQty || serving}
            >
              <Plus
                size={20}
                color={quantity >= maxQty ? colors.textDisabled : colors.textPrimary}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={serveStyles.serveBtn}
            onPress={handleServe}
            disabled={serving}
            activeOpacity={0.85}
          >
            <Animated.View
              style={[
                serveStyles.progressFill,
                {
                  width: progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
            {showCheck ? (
              <Animated.View style={{ opacity: checkOpacity }}>
                <CheckCircle size={28} color={colors.white} />
              </Animated.View>
            ) : serving ? (
              <Text style={serveStyles.serveBtnText}>Serving...</Text>
            ) : (
              <Text style={serveStyles.serveBtnText}>Serve</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Customer Detail View
// ---------------------------------------------------------------------------

interface CustomerDetailViewProps {
  customerId: string;
  onBack: () => void;
}

function timelineIcon(kind: TimelineEntry['kind']) {
  const size = 16;
  switch (kind) {
    case 'order':
      return <ShoppingBag size={size} color={colors.primary} />;
    case 'pack_purchase':
      return <Package size={size} color={colors.pack} />;
    case 'pack_serve':
      return <Coffee size={size} color={colors.success} />;
    case 'pack_refund':
      return <RotateCcw size={size} color={colors.warning} />;
    case 'pack_adjust':
      return <Settings size={size} color={colors.textSecondary} />;
  }
}

function CustomerDetailView({ customerId, onBack }: CustomerDetailViewProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [packs, setPacks] = useState<CustomerPack[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [packTransactions, setPackTransactions] = useState<PackTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [serveTargetPack, setServeTargetPack] = useState<CustomerPack | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        const headers = { Authorization: `Bearer ${token}` };

        const [detailRes, packsRes, ordersRes, historyRes] = await Promise.all([
          fetch(`${API_URL}/customers/${customerId}`, { headers }),
          fetch(`${API_URL}/customers/${customerId}/packs`, { headers }),
          fetch(`${API_URL}/customers/${customerId}/orders?limit=20`, { headers }),
          fetch(`${API_URL}/customers/${customerId}/packs/history?limit=50`, { headers }),
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
        if (historyRes.ok) {
          const data = await historyRes.json();
          setPackTransactions(Array.isArray(data) ? data : (data.data ?? []));
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

  const refreshPacks = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const headers = { Authorization: `Bearer ${token}` };
      const [packsRes, historyRes] = await Promise.all([
        fetch(`${API_URL}/customers/${customerId}/packs`, { headers }),
        fetch(`${API_URL}/customers/${customerId}/packs/history?limit=50`, { headers }),
      ]);
      if (packsRes.ok) {
        const data = await packsRes.json();
        setPacks(Array.isArray(data) ? data : (data.packs ?? []));
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setPackTransactions(Array.isArray(data) ? data : (data.data ?? []));
      }
    } catch {
      // silently fail
    }
  }, [customerId]);

  // Build unified timeline
  const timeline: TimelineEntry[] = React.useMemo(() => {
    const entries: TimelineEntry[] = [];

    for (const o of orders) {
      entries.push({
        id: `order-${o.id}`,
        kind: 'order',
        title: `Order ${o.orderNumber}`,
        subtitle: `${o.itemCount} item${o.itemCount !== 1 ? 's' : ''} · $${o.total.toFixed(2)} · ${o.status}`,
        timestamp: o.createdAt,
      });
    }

    for (const t of packTransactions) {
      const label =
        t.type === 'pack_purchase'
          ? 'Pack purchased'
          : t.type === 'pack_serve'
            ? 'Served from pack'
            : t.type === 'pack_refund'
              ? 'Pack refunded'
              : 'Pack adjusted';
      entries.push({
        id: `pt-${t.id}`,
        kind: t.type,
        title: `${label}${t.packProductName ? ` — ${t.packProductName}` : ''}`,
        subtitle: t.description || `Qty: ${t.quantity}`,
        timestamp: t.createdAt,
      });
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return entries;
  }, [orders, packTransactions]);

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
  const activePacks = packs.filter(
    (p) => p.status === 'active' && !(p.expiryDate && new Date(p.expiryDate) < new Date()),
  );

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
          style={[styles.historyToggle, showHistory && styles.historyToggleActive]}
          onPress={() => setShowHistory((v) => !v)}
        >
          <Text style={[styles.historyToggleText, showHistory && styles.historyToggleTextActive]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {showHistory ? (
        /* ── History timeline ── */
        <FlatList
          data={timeline}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyTab}>
              <Text style={styles.emptyTabText}>No activity yet</Text>
            </View>
          }
          renderItem={({ item: entry }) => (
            <View style={styles.timelineRow}>
              <View style={styles.timelineIcon}>{timelineIcon(entry.kind)}</View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>{entry.title}</Text>
                <Text style={styles.timelineSubtitle}>{entry.subtitle}</Text>
              </View>
              <Text style={styles.timelineDate}>
                {new Date(entry.timestamp).toLocaleDateString()}{' '}
                {new Date(entry.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          )}
        />
      ) : (
        /* ── Two-column: profile (left 40%) + packs (right 60%) ── */
        <View style={styles.twoColumn}>
          {/* LEFT — profile & stats */}
          <ScrollView style={styles.columnLeft} contentContainerStyle={styles.columnLeftContent}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>
                {detail.firstName[0]}
                {detail.lastName[0]}
              </Text>
            </View>

            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Total Spent</Text>
              <Text style={styles.overviewValue}>${(detail.totalSpent ?? 0).toFixed(2)}</Text>
            </View>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Visits</Text>
              <Text style={styles.overviewValue}>{detail.visitCount ?? 0}</Text>
            </View>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Last Visit</Text>
              <Text style={styles.overviewValue}>
                {detail.lastVisit ? new Date(detail.lastVisit).toLocaleDateString() : '—'}
              </Text>
            </View>
            {detail.phone && (
              <View style={styles.overviewCard}>
                <Text style={styles.overviewLabel}>Phone</Text>
                <Text style={styles.overviewValue}>{detail.phone}</Text>
              </View>
            )}
            {detail.email && (
              <View style={styles.overviewCard}>
                <Text style={styles.overviewLabel}>Email</Text>
                <Text style={styles.overviewValue}>{detail.email}</Text>
              </View>
            )}
            <View style={styles.overviewCard}>
              <Text style={styles.overviewLabel}>Customer Since</Text>
              <Text style={styles.overviewValue}>
                {new Date(detail.createdAt).toLocaleDateString()}
              </Text>
            </View>
          </ScrollView>

          {/* RIGHT — active packs with serve buttons */}
          <FlatList
            style={styles.columnRight}
            data={activePacks}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.columnRightContent}
            ListHeaderComponent={
              <Text style={styles.columnRightHeader}>Active Packs ({activePacks.length})</Text>
            }
            ListEmptyComponent={
              <View style={styles.emptyTab}>
                <Text style={styles.emptyTabText}>No active packs</Text>
              </View>
            }
            renderItem={({ item: pack }) => (
              <View style={styles.packCard}>
                <View style={styles.packCardHeader}>
                  <Text style={styles.packProductName}>{pack.productName}</Text>
                  <View style={[styles.packStatusBadge, styles.packStatusActive]}>
                    <Text style={styles.packStatusText}>ACTIVE</Text>
                  </View>
                </View>
                <View style={styles.packCardBody}>
                  <Text style={styles.packDetail}>
                    Remaining: {pack.remainingQuantity}/{pack.totalQuantity}
                  </Text>
                  <Text style={styles.packDetail}>Paid: ${pack.pricePaid.toFixed(2)}</Text>
                  {pack.expiryDate && (
                    <Text style={styles.packDetail}>
                      Expires: {new Date(pack.expiryDate).toLocaleDateString()}
                    </Text>
                  )}
                </View>
                {pack.remainingQuantity > 0 && (
                  <TouchableOpacity
                    style={styles.packServeButton}
                    onPress={() => setServeTargetPack(pack)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.packServeButtonText}>Serve</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          />
        </View>
      )}

      <ServeConfirmationModal
        visible={serveTargetPack !== null}
        pack={serveTargetPack}
        customerId={customerId}
        onComplete={() => {
          setServeTargetPack(null);
          refreshPacks();
        }}
        onCancel={() => setServeTargetPack(null)}
      />
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

  // If offline, show placeholder
  if (!isOnline && customers.length === 0 && !loading) {
    return <OfflinePlaceholder />;
  }

  // Customer detail view
  if (selectedCustomerId) {
    return (
      <CustomerDetailView
        customerId={selectedCustomerId}
        onBack={() => setSelectedCustomerId(null)}
      />
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
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

  // History toggle
  historyToggle: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyToggleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  historyToggleText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  historyToggleTextActive: {
    color: colors.white,
  },

  // Two-column layout
  twoColumn: {
    flex: 1,
    flexDirection: 'row',
  },
  columnLeft: {
    width: '40%',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  columnLeftContent: {
    padding: spacing.lg,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    alignSelf: 'center',
  },
  profileAvatarText: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  columnRight: {
    flex: 1,
  },
  columnRightContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  columnRightHeader: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  // Timeline
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  timelineSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  timelineDate: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginLeft: spacing.sm,
    marginTop: 2,
  },

  emptyTab: {
    padding: spacing.xxxl,
    alignItems: 'center',
  },
  emptyTabText: {
    fontSize: typography.size.base,
    color: colors.textMuted,
  },

  // Overview stats
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
    marginBottom: spacing.md,
    padding: 14,
    backgroundColor: colors.packLight,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#e9d5ff',
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
  packStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  packStatusActive: {
    backgroundColor: '#dcfce7',
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
  packServeButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: 'flex-start',
    marginTop: spacing.md,
  },
  packServeButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.white,
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

// ---------------------------------------------------------------------------
// Serve Confirmation Modal styles
// ---------------------------------------------------------------------------

const serveStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    width: 360,
    position: 'relative',
  },
  cancelLink: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 1,
    padding: spacing.xs,
  },
  packSummary: {
    marginBottom: spacing.xl,
    paddingRight: spacing.xxl,
  },
  packName: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  packRemaining: {
    fontSize: typography.size.base,
    color: colors.pack,
    fontWeight: typography.weight.semibold,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    marginBottom: spacing.xl,
  },
  stepperBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperValue: {
    fontSize: typography.size['3xl'],
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    minWidth: 48,
    textAlign: 'center',
  },
  serveBtn: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.lg,
  },
  serveBtnText: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
});
