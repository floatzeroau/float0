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
  KeyboardAvoidingView,
  Platform,
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
  RefreshCw,
} from 'lucide-react-native';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import { useToast } from '../components/Toast';
import { useSync } from '../sync/SyncProvider';
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

interface PackProductSnapshot {
  name?: string;
  basePrice?: number;
  modifiers?: Array<{ name: string; price?: number }>;
  [key: string]: unknown;
}

interface CustomerPack {
  id: string;
  productId: string;
  productSnapshot: PackProductSnapshot;
  totalQuantity: number;
  remainingQuantity: number;
  pricePaid: number;
  unitValue: number;
  expiryDate: string | null;
  status: string;
  sourceOrderId: string | null;
  purchasedAt: string;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  total: number;
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
  recentOrders: RecentOrder[];
}

interface PackTransaction {
  id: string;
  packId: string;
  type: 'purchase' | 'serve' | 'refund' | 'admin_adjust';
  quantity: number;
  amount: number | null;
  notes: string | null;
  createdAt: string;
  productSnapshot: PackProductSnapshot;
}

interface TimelineEntry {
  id: string;
  kind: 'order' | 'purchase' | 'serve' | 'refund' | 'admin_adjust';
  title: string;
  subtitle: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModifierNames(snapshot: any): string[] {
  const mods = snapshot?.modifiers;
  if (!Array.isArray(mods)) return [];
  return (
    mods
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((m: any) => (typeof m === 'string' ? m : m?.name))
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
  );
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
          toast.success(`Served ${quantity} × ${pack.productSnapshot?.name ?? 'pack'}`);
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
            <Text style={serveStyles.packName}>{pack.productSnapshot?.name ?? 'Pack'}</Text>
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
    case 'purchase':
      return <Package size={size} color={colors.primary} />;
    case 'serve':
      return <Coffee size={size} color={colors.success} />;
    case 'refund':
      return <RotateCcw size={size} color={colors.warning} />;
    case 'admin_adjust':
      return <Settings size={size} color={colors.textSecondary} />;
  }
}

function CustomerDetailView({ customerId, onBack }: CustomerDetailViewProps) {
  const { syncNow } = useSync();
  const [activeTab, setActiveTab] = useState<'packs' | 'history'>('packs');
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [packs, setPacks] = useState<CustomerPack[]>([]);
  const [packTransactions, setPackTransactions] = useState<PackTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [serveTargetPack, setServeTargetPack] = useState<CustomerPack | null>(null);

  const loadData = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const headers = { Authorization: `Bearer ${token}` };

      const [detailRes, activePacksRes, expiredPacksRes, consumedPacksRes, historyRes] =
        await Promise.all([
          fetch(`${API_URL}/customers/${customerId}`, { headers }),
          fetch(`${API_URL}/customers/${customerId}/packs`, { headers }),
          fetch(`${API_URL}/customers/${customerId}/packs?status=expired`, { headers }),
          fetch(`${API_URL}/customers/${customerId}/packs?status=consumed`, { headers }),
          fetch(`${API_URL}/customers/${customerId}/packs/history?limit=50`, { headers }),
        ]);

      if (detailRes.ok) {
        const d = await detailRes.json();
        setDetail(d);
      }
      {
        const allPacks: CustomerPack[] = [];
        for (const res of [activePacksRes, expiredPacksRes, consumedPacksRes]) {
          if (res.ok) {
            const data = await res.json();
            const arr: CustomerPack[] = Array.isArray(data) ? data : (data.packs ?? []);
            allPacks.push(...arr);
          }
        }
        setPacks(allPacks);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setPackTransactions(Array.isArray(data) ? data : (data.data ?? []));
      }
    } catch {
      // silently fail
    }
  }, [customerId]);

  useEffect(() => {
    let cancelled = false;
    // Push pending local changes so engine stats are fresh
    syncNow();
    (async () => {
      await loadData();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, syncNow, loadData]);

  const handleRefresh = useCallback(async () => {
    syncNow();
    // Small delay to let sync push complete
    await new Promise((r) => setTimeout(r, 1500));
    await loadData();
  }, [syncNow, loadData]);

  // Build unified timeline
  const timeline: TimelineEntry[] = React.useMemo(() => {
    const entries: TimelineEntry[] = [];

    const recentOrders = detail?.recentOrders ?? [];
    for (const o of recentOrders) {
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
        t.type === 'purchase'
          ? 'Pack purchased'
          : t.type === 'serve'
            ? 'Served from pack'
            : t.type === 'refund'
              ? 'Pack refunded'
              : 'Pack adjusted';
      const productName = t.productSnapshot?.name;
      const subtitle = t.notes
        ? t.notes
        : t.amount != null
          ? `Qty: ${Math.abs(t.quantity)} · $${Math.abs(t.amount).toFixed(2)}`
          : `Qty: ${Math.abs(t.quantity)}`;
      entries.push({
        id: `pt-${t.id}`,
        kind: t.type,
        title: `${label}${productName ? ` — ${productName}` : ''}`,
        subtitle,
        timestamp: t.createdAt,
      });
    }

    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return entries;
  }, [detail, packTransactions]);

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
  const activePackCount = packs.filter((p) => p.status === 'active').length;

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
        </View>
      </View>

      {/* Two-column: sidebar (left 280px) + packs panel (right flex) */}
      <View style={styles.twoColumn}>
        {/* LEFT — Profile sidebar */}
        <ScrollView style={styles.sidebarColumn} contentContainerStyle={styles.sidebarContent}>
          {/* Refresh button — top-right corner */}
          <TouchableOpacity onPress={handleRefresh} style={styles.sidebarRefreshBtn}>
            <RefreshCw size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {detail.firstName[0]}
              {detail.lastName[0]}
            </Text>
          </View>
          <Text style={styles.sidebarName}>{customerName}</Text>
          {detail.email && <Text style={styles.sidebarContact}>{detail.email}</Text>}
          {detail.phone && <Text style={styles.sidebarContact}>{detail.phone}</Text>}

          <View style={styles.sidebarDivider} />

          {/* Total Spent — full width */}
          <View style={styles.statFullWidth}>
            <Text style={styles.statBigValue}>${(detail.totalSpent ?? 0).toFixed(2)}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>

          {/* Visits | Active Packs — side by side */}
          <View style={styles.statRow}>
            <View style={styles.statHalf}>
              <Text style={styles.statBigValue}>{detail.visitCount ?? 0}</Text>
              <Text style={styles.statLabel}>Visits</Text>
            </View>
            <View style={styles.statHalf}>
              <Text style={styles.statBigValue}>{activePackCount}</Text>
              <Text style={styles.statLabel}>Active Packs</Text>
            </View>
          </View>

          <View style={styles.sidebarDivider} />

          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Last Visit</Text>
            <Text style={styles.overviewValue}>
              {detail.lastVisit ? new Date(detail.lastVisit).toLocaleDateString() : '—'}
            </Text>
          </View>
          <View style={styles.overviewCard}>
            <Text style={styles.overviewLabel}>Member Since</Text>
            <Text style={styles.overviewValue}>
              {new Date(detail.createdAt).toLocaleDateString()}
            </Text>
          </View>
        </ScrollView>

        {/* RIGHT — Packs / History with tab bar */}
        <View style={styles.mainColumn}>
          <View style={styles.tabBar}>
            {(['packs', 'history'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                  {tab === 'packs' ? `Packs (${packs.length})` : 'History'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeTab === 'packs' ? (
            <FlatList
              data={packs}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.packListContent}
              ListEmptyComponent={
                <View style={styles.emptyTab}>
                  <Package size={32} color={colors.textMuted} />
                  <Text style={styles.emptyTabText}>No packs yet</Text>
                </View>
              }
              renderItem={({ item: pack }) => {
                const isExpired =
                  pack.status === 'expired' ||
                  (pack.expiryDate && new Date(pack.expiryDate) < new Date());
                const isActive = pack.status === 'active' && !isExpired;
                const pctRemaining =
                  pack.totalQuantity > 0 ? (pack.remainingQuantity / pack.totalQuantity) * 100 : 0;
                const snapshot = pack.productSnapshot;
                const productName = snapshot?.name ?? `Product ${pack.productId.slice(0, 8)}`;
                const modNames = getModifierNames(snapshot);
                const perServe =
                  pack.pricePaid > 0 && pack.totalQuantity > 0
                    ? pack.pricePaid / pack.totalQuantity
                    : 0;

                return (
                  <View style={[styles.packCard, !isActive && styles.packCardInactive]}>
                    {/* Product name — 18px, weight 600 */}
                    <Text style={styles.packProductName}>{productName}</Text>

                    {/* Modifiers — 13px, purple, comma-joined */}
                    {modNames.length > 0 && (
                      <Text style={styles.packModifiers}>{modNames.join(', ')}</Text>
                    )}

                    {/* Purchased date — 12px, muted */}
                    <Text style={styles.packCreatedDate}>
                      Purchased {new Date(pack.purchasedAt).toLocaleDateString()}
                    </Text>

                    {/* Thin horizontal divider */}
                    <View style={styles.packDivider} />

                    {/* Progress row: label + bar + X/Y */}
                    <View style={styles.packProgressRow}>
                      <Text style={styles.packProgressLabel}>Progress</Text>
                      <View style={styles.packProgressTrack}>
                        <View
                          style={[
                            styles.packProgressFill,
                            {
                              width: `${pctRemaining}%`,
                              backgroundColor: isActive ? colors.primary : colors.textDisabled,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.packProgressCount}>
                        {pack.remainingQuantity}/{pack.totalQuantity}
                      </Text>
                    </View>

                    {/* Total paid — 14px */}
                    <View style={styles.packStatRow}>
                      <Text style={styles.packDetailLabel}>Total paid</Text>
                      <Text style={styles.packDetailValue}>
                        ${(pack.pricePaid ?? 0).toFixed(2)}
                      </Text>
                    </View>

                    {/* Per serve — 14px (pricePaid / totalQuantity if both > 0) */}
                    <View style={styles.packStatRow}>
                      <Text style={styles.packDetailLabel}>Per serve</Text>
                      <Text style={styles.packDetailValue}>${perServe.toFixed(2)}</Text>
                    </View>

                    {/* Expiry if set — 14px */}
                    {pack.expiryDate && (
                      <View style={styles.packStatRow}>
                        <Text style={[styles.packDetailLabel, isExpired && styles.packExpiredText]}>
                          {isExpired ? 'Expired' : 'Expires'}
                        </Text>
                        <Text style={[styles.packDetailValue, isExpired && styles.packExpiredText]}>
                          {new Date(pack.expiryDate).toLocaleDateString()}
                        </Text>
                      </View>
                    )}

                    {/* Serve button — ONLY if active && not expired */}
                    {isActive && !isExpired ? (
                      <TouchableOpacity
                        style={styles.packServeButton}
                        onPress={() => setServeTargetPack(pack)}
                        activeOpacity={0.85}
                      >
                        <Coffee size={18} color={colors.white} />
                        <Text style={styles.packServeButtonText}>Serve</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.packStatusPill}>
                        <Text style={styles.packStatusPillText}>
                          {isExpired
                            ? 'Expired'
                            : pack.status === 'consumed'
                              ? 'Fully redeemed'
                              : pack.status === 'refunded'
                                ? 'Refunded'
                                : 'Inactive'}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          ) : (
            <FlatList
              data={timeline}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.mainListContent}
              ListEmptyComponent={
                <View style={styles.emptyTab}>
                  <ShoppingBag size={32} color={colors.textMuted} />
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
          )}
        </View>
      </View>

      <ServeConfirmationModal
        visible={serveTargetPack !== null}
        pack={serveTargetPack}
        customerId={customerId}
        onComplete={() => {
          setServeTargetPack(null);
          loadData();
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
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
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
        </KeyboardAvoidingView>
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
  // Two-column layout
  twoColumn: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebarColumn: {
    width: 280,
    backgroundColor: '#F5F5F5',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  mainColumn: {
    flex: 1,
  },
  sidebarContent: {
    padding: 20,
    alignItems: 'center',
    position: 'relative',
  },
  sidebarRefreshBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    zIndex: 1,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  profileAvatarText: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  sidebarName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  sidebarContact: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 2,
  },
  sidebarDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  statFullWidth: {
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    width: '100%',
    gap: spacing.md,
  },
  statHalf: {
    flex: 1,
    alignItems: 'center',
  },
  statBigValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  tab: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: -1,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.primary,
  },

  mainListContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxxl,
  },

  // Timeline
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
    gap: spacing.md,
  },
  emptyTabText: {
    fontSize: typography.size.base,
    color: colors.textMuted,
  },

  // Overview stats (sidebar)
  overviewCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    width: '100%',
  },
  overviewLabel: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  overviewValue: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },

  // Packs list
  packListContent: {
    padding: 20,
    gap: 16,
  },
  packCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 18,
    ...({
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 1,
    } as object),
  },
  packCardInactive: {
    opacity: 0.6,
  },
  packProductName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  packModifiers: {
    fontSize: 13,
    color: colors.primary,
    marginTop: 4,
  },
  packCreatedDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  packDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  packProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  packProgressLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  packProgressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  packProgressFill: {
    height: 6,
    borderRadius: 3,
  },
  packProgressCount: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    minWidth: 36,
    textAlign: 'right',
  },
  packStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  packDetailLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  packDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  packExpiredText: {
    color: colors.danger,
  },
  packServeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radii.md,
    height: 56,
    marginTop: 12,
  },
  packServeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  packStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceAlt,
    marginTop: 12,
  },
  packStatusPillText: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    fontWeight: typography.weight.medium,
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
    color: colors.success,
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
    backgroundColor: colors.success,
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
    backgroundColor: colors.success,
    borderRadius: radii.lg,
  },
  serveBtnText: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
});
