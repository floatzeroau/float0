import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { Q } from '@nozbe/watermelondb';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ReceiptData } from '@float0/shared';
import { buildReceipt } from '@float0/shared';
import { database } from '../db/database';
import type { Order, OrderItem, Product, Customer, Payment } from '../db/models';
import { STATUS_LABELS, STATUS_COLOURS } from '../state/order-lifecycle';
import type { OrderStatusDB } from '../state/order-lifecycle';
import { useOrder } from '../state/order-store';
import type { MainTabParamList } from '../navigation/RootNavigator';
import { ReceiptPreview } from '../components/ReceiptPreview';
import { getPrinterService } from '../services';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import { RefundScreen } from './RefundScreen';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyncStatus = 'synced' | 'created' | 'updated';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatusDB;
  orderType: string;
  tableNumber: string;
  total: number;
  itemCount: number;
  customerName: string | null;
  createdAt: number;
  notes: string;
  syncStatus: SyncStatus;
}

interface OrderDetailItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: { name: string }[];
  notes: string;
  voidedAt: number;
  voidReason: string;
  overridePrice: number;
  overrideReason: string;
}

type FilterTab = 'all' | 'active' | 'completed' | 'cancelled';

const ACTIVE_STATUSES: OrderStatusDB[] = ['draft', 'submitted', 'in_progress', 'ready'];
const MANAGEABLE_STATUSES: OrderStatusDB[] = ['submitted', 'in_progress'];

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: OrderStatusDB }) {
  const bg = STATUS_COLOURS[status] ?? '#9ca3af';
  const label = STATUS_LABELS[status] ?? status;

  return (
    <View style={[styles.statusBadge, { backgroundColor: bg + '20' }]}>
      <Text style={[styles.statusBadgeText, { color: bg }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Order Detail Modal
// ---------------------------------------------------------------------------

function OrderDetailModal({
  order,
  visible,
  onClose,
  onManage,
  onRefund,
}: {
  order: OrderRow | null;
  visible: boolean;
  onClose: () => void;
  onManage: (orderId: string) => void;
  onRefund: (orderId: string) => void;
}) {
  const [items, setItems] = useState<OrderDetailItem[]>([]);
  const [receiptPreview, setReceiptPreview] = useState<ReceiptData | null>(null);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    if (!order || !visible) return;

    // Reset reprint state when order changes
    setReceiptPreview(null);
    setShowEmailInput(false);
    setEmailAddress('');
    setEmailSent(false);

    (async () => {
      const orderItems = await database
        .get<OrderItem>('order_items')
        .query(Q.where('order_id', order.id))
        .fetch();

      const loaded: OrderDetailItem[] = await Promise.all(
        orderItems.map(async (oi) => {
          let productName = 'Unknown';
          try {
            const product = await database.get<Product>('products').find(oi.productId);
            productName = product.name;
          } catch {
            // deleted product
          }

          const mods: { name: string }[] = Array.isArray(oi.modifiersJson)
            ? oi.modifiersJson.map((m: { name?: string }) => ({ name: m.name ?? '' }))
            : [];

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = (oi as any)._raw;

          return {
            id: oi.id,
            productName,
            quantity: oi.quantity,
            unitPrice: oi.unitPrice,
            lineTotal: oi.lineTotal,
            modifiers: mods,
            notes: oi.notes ?? '',
            voidedAt: raw.voided_at || 0,
            voidReason: raw.void_reason || '',
            overridePrice: raw.override_price || 0,
            overrideReason: raw.override_reason || '',
          };
        }),
      );

      setItems(loaded);
    })();
  }, [order, visible]);

  const handleReprint = useCallback(async () => {
    if (!order) return;

    // Try to load stored receipt JSON first
    try {
      const orderRecord = await database.get<Order>('orders').find(order.id);
      if (orderRecord.receiptJson) {
        const stored = JSON.parse(orderRecord.receiptJson) as ReceiptData;
        stored.reprintDate = new Date().toISOString();
        setReceiptPreview(stored);
        return;
      }
    } catch {
      // fall through to rebuild
    }

    // Rebuild from DB data
    const orderRecord = await database.get<Order>('orders').find(order.id);
    const orderItems = await database
      .get<OrderItem>('order_items')
      .query(Q.where('order_id', order.id))
      .fetch();
    const payments = await database
      .get<Payment>('payments')
      .query(Q.where('order_id', order.id), Q.where('status', 'completed'))
      .fetch();

    const receiptItems = await Promise.all(
      orderItems.map(async (oi) => {
        let productName = 'Unknown';
        let isGstFree = false;
        try {
          const product = await database.get<Product>('products').find(oi.productId);
          productName = product.name;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          isGstFree = (product as any).isGstFree ?? false;
        } catch {
          // deleted product
        }

        const mods: string[] = Array.isArray(oi.modifiersJson)
          ? oi.modifiersJson.map((m: { name?: string }) => m.name ?? '')
          : [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (oi as any)._raw;

        return {
          productName,
          modifiers: mods,
          quantity: oi.quantity,
          unitPrice: oi.unitPrice,
          lineTotal: oi.lineTotal,
          discountAmount: oi.discountAmount ?? 0,
          isVoided: (raw.voided_at || 0) > 0,
          isGstFree,
        };
      }),
    );

    const receiptPayments = payments.map((p) => ({
      method: p.method as 'cash' | 'card',
      amount: p.amount,
      tipAmount: p.tipAmount ?? 0,
      ...(p.tenderedAmount != null && { tenderedAmount: p.tenderedAmount }),
      ...(p.changeGiven != null && { changeGiven: p.changeGiven }),
      ...(p.roundingAmount != null && { roundingAmount: p.roundingAmount }),
      ...(p.cardType && { cardType: p.cardType }),
      ...(p.lastFour && { lastFour: p.lastFour }),
      ...(p.reference && { approvalCode: p.reference }),
    }));

    let customerName: string | undefined;
    if (orderRecord.customerId) {
      try {
        const c = await database.get<Customer>('customers').find(orderRecord.customerId);
        customerName = [c.firstName, c.lastName].filter(Boolean).join(' ') || undefined;
      } catch {
        // deleted customer
      }
    }

    const receipt = buildReceipt(
      {
        businessName: 'Float POS',
        abn: '12 345 678 901',
        address: '123 Main Street',
        phone: '03 9123 4567',
      },
      {
        orderNumber: orderRecord.orderNumber,
        orderType: orderRecord.orderType as 'takeaway' | 'dine_in',
        tableNumber: orderRecord.tableNumber ?? undefined,
        subtotal: orderRecord.subtotal,
        gstAmount: orderRecord.gst,
        discountTotal: orderRecord.discountAmount,
        total: orderRecord.total,
        createdAt: orderRecord.createdAt.getTime(),
        customerName,
      },
      receiptItems,
      receiptPayments,
      'Staff',
    );

    receipt.reprintDate = new Date().toISOString();
    setReceiptPreview(receipt);
  }, [order]);

  const handlePrintReprint = useCallback(() => {
    if (receiptPreview) {
      getPrinterService()
        .printReceipt(receiptPreview)
        .catch(() => {});
    }
  }, [receiptPreview]);

  const handleEmailReprint = useCallback(() => {
    if (emailSent) return;
    setShowEmailInput(true);
  }, [emailSent]);

  const handleSendEmail = useCallback(async () => {
    const trimmed = emailAddress.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }
    if (!order) return;

    setEmailSending(true);
    try {
      const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
      const response = await fetch(`${API_URL}/receipts/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ orderId: order.id, email: trimmed }),
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
      Alert.alert('Email saved', 'Email saved for when online');
      setEmailSent(true);
      setShowEmailInput(false);
    } finally {
      setEmailSending(false);
    }
  }, [emailAddress, order]);

  if (!order) return null;

  const time = new Date(order.createdAt);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const typeLabel =
    order.orderType === 'dine_in'
      ? `Dine-in${order.tableNumber ? ` #${order.tableNumber}` : ''}`
      : 'Takeaway';

  const canManage = MANAGEABLE_STATUSES.includes(order.status);
  const canRefund = order.status === 'completed';
  const canReprint = order.status === 'completed';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      supportedOrientations={['landscape-left', 'landscape-right']}
    >
      <View style={styles.detailOverlay}>
        <View style={styles.detailSheet}>
          {/* Header */}
          <View style={styles.detailHeader}>
            <View>
              <Text style={styles.detailOrderNumber}>{order.orderNumber}</Text>
              <Text style={styles.detailMeta}>
                {timeStr} · {typeLabel}
                {order.customerName ? ` · ${order.customerName}` : ''}
              </Text>
            </View>
            <StatusBadge status={order.status} />
          </View>

          {/* Receipt preview */}
          {receiptPreview ? (
            <View style={styles.reprintContainer}>
              <View style={styles.reprintPreviewWrapper}>
                <ReceiptPreview data={receiptPreview} />
              </View>

              {/* Email input */}
              {showEmailInput && (
                <View style={styles.reprintEmailContainer}>
                  <TextInput
                    style={styles.reprintEmailInput}
                    placeholder="customer@email.com"
                    placeholderTextColor="#999"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={emailAddress}
                    onChangeText={setEmailAddress}
                    editable={!emailSending}
                  />
                  <View style={styles.reprintEmailRow}>
                    <TouchableOpacity
                      style={[styles.reprintEmailSend, emailSending && styles.buttonDisabled]}
                      onPress={handleSendEmail}
                      disabled={emailSending}
                    >
                      <Text style={styles.reprintEmailSendText}>
                        {emailSending ? 'Sending...' : 'Send'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.reprintEmailCancel}
                      onPress={() => setShowEmailInput(false)}
                      disabled={emailSending}
                    >
                      <Text style={styles.reprintEmailCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Print / Email / Back buttons */}
              <View style={styles.reprintActions}>
                <TouchableOpacity style={styles.reprintPrintButton} onPress={handlePrintReprint}>
                  <Text style={styles.reprintPrintButtonText}>Print</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.reprintEmailButton, emailSent && styles.buttonDisabled]}
                  onPress={handleEmailReprint}
                  disabled={emailSent}
                >
                  <Text style={styles.reprintEmailButtonText}>
                    {emailSent ? 'Email Sent' : 'Email'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.reprintBackButton}
                  onPress={() => setReceiptPreview(null)}
                >
                  <Text style={styles.reprintBackButtonText}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {/* Items */}
              <ScrollView style={styles.detailItems} showsVerticalScrollIndicator={false}>
                {items.map((item) => {
                  const isVoided = item.voidedAt > 0;
                  const hasOverride = item.overridePrice > 0;
                  return (
                    <View key={item.id} style={styles.detailItemRow}>
                      <View style={styles.detailItemInfo}>
                        <Text
                          style={[styles.detailItemName, isVoided && styles.detailItemNameVoided]}
                        >
                          {item.quantity}x {item.productName}
                        </Text>
                        {item.modifiers.length > 0 && (
                          <Text style={styles.detailItemMods}>
                            {item.modifiers.map((m) => m.name).join(', ')}
                          </Text>
                        )}
                        {hasOverride && !isVoided && (
                          <>
                            <View style={styles.detailOverrideBadge}>
                              <Text style={styles.detailOverrideBadgeText}>OVERRIDE</Text>
                            </View>
                            {item.overrideReason !== '' && (
                              <Text style={styles.detailOverrideReason}>{item.overrideReason}</Text>
                            )}
                          </>
                        )}
                        {isVoided && (
                          <>
                            <View style={styles.detailVoidBadge}>
                              <Text style={styles.detailVoidBadgeText}>VOID</Text>
                            </View>
                            {item.voidReason !== '' && (
                              <Text style={styles.detailVoidReason}>{item.voidReason}</Text>
                            )}
                          </>
                        )}
                        {!isVoided && item.notes !== '' && (
                          <Text style={styles.detailItemNotes}>{item.notes}</Text>
                        )}
                      </View>
                      {hasOverride && !isVoided ? (
                        <View style={styles.detailItemPriceCol}>
                          <Text style={styles.detailItemTotalStrikethrough}>
                            ${item.unitPrice.toFixed(2)}
                          </Text>
                          <Text style={styles.detailItemTotalOverride}>
                            ${item.overridePrice.toFixed(2)}
                          </Text>
                        </View>
                      ) : (
                        <Text
                          style={[styles.detailItemTotal, isVoided && styles.detailItemTotalVoided]}
                        >
                          ${item.lineTotal.toFixed(2)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </ScrollView>

              {/* Notes (cancellation reason) */}
              {order.notes !== '' && (
                <View style={styles.detailNotes}>
                  <Text style={styles.detailNotesText}>{order.notes}</Text>
                </View>
              )}

              {/* Total */}
              <View style={styles.detailTotalRow}>
                <Text style={styles.detailTotalLabel}>Total</Text>
                <Text style={styles.detailTotalValue}>${order.total.toFixed(2)}</Text>
              </View>

              {/* Manage Order button */}
              {canManage && (
                <TouchableOpacity style={styles.manageButton} onPress={() => onManage(order.id)}>
                  <Text style={styles.manageButtonText}>Manage Order</Text>
                </TouchableOpacity>
              )}

              {/* Reprint Receipt button */}
              {canReprint && (
                <TouchableOpacity style={styles.reprintButton} onPress={handleReprint}>
                  <Text style={styles.reprintButtonText}>Reprint Receipt</Text>
                </TouchableOpacity>
              )}

              {/* Refund button */}
              {canRefund && (
                <TouchableOpacity style={styles.refundButton} onPress={() => onRefund(order.id)}>
                  <Text style={styles.refundButtonText}>Refund</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Close */}
          <TouchableOpacity style={styles.detailCloseButton} onPress={onClose}>
            <Text style={styles.detailCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// OrderHistoryScreen
// ---------------------------------------------------------------------------

interface RefundOrderData {
  id: string;
  orderNumber: string;
  total: number;
  originalPaymentMethod: 'cash' | 'card' | 'split';
  originalApprovalCode?: string;
}

export default function OrderHistoryScreen() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [refundOrder, setRefundOrder] = useState<RefundOrderData | null>(null);
  const { loadSubmittedOrder } = useOrder();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const loadOrders = useCallback(async () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const rows = await database
      .get<Order>('orders')
      .query(Q.where('created_at', Q.gte(sevenDaysAgo.getTime())), Q.sortBy('created_at', Q.desc))
      .fetch();

    const mapped: OrderRow[] = [];
    for (const o of rows) {
      // Count items
      const itemRows = await database
        .get<OrderItem>('order_items')
        .query(Q.where('order_id', o.id))
        .fetch();

      // Skip empty draft orders ($0 with no items)
      if (o.status === 'draft' && o.total === 0 && itemRows.length === 0) continue;

      let customerName: string | null = null;
      if (o.customerId) {
        try {
          const c = await database.get<Customer>('customers').find(o.customerId);
          customerName = [c.firstName, c.lastName].filter(Boolean).join(' ') || null;
        } catch {
          // deleted customer
        }
      }

      mapped.push({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status as OrderStatusDB,
        orderType: o.orderType,
        tableNumber: o.tableNumber ?? '',
        total: o.total,
        itemCount: itemRows.length,
        customerName,
        createdAt: o.createdAt.getTime(),
        notes: o.notes ?? '',
        syncStatus: (o._raw as any)._status as SyncStatus,
      });
    }

    setOrders(mapped);
  }, []);

  useEffect(() => {
    loadOrders();
    // Refresh every 5 seconds
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleManageOrder = useCallback(
    async (orderId: string) => {
      setSelectedOrder(null);
      await loadSubmittedOrder(orderId);
      navigation.navigate('POS');
    },
    [loadSubmittedOrder, navigation],
  );

  const handleRefund = useCallback(
    async (orderId: string) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;

      // Determine original payment method and approval code
      let originalMethod: 'cash' | 'card' | 'split' = 'cash';
      let originalApprovalCode: string | undefined;
      try {
        const payments = await database
          .get<Payment>('payments')
          .query(Q.where('order_id', orderId), Q.where('status', 'completed'))
          .fetch();

        if (payments.length > 1) {
          originalMethod = 'split';
        } else if (payments.length === 1) {
          originalMethod = payments[0].method === 'card' ? 'card' : 'cash';
          if (originalMethod === 'card' && payments[0].reference) {
            originalApprovalCode = payments[0].reference;
          }
        }
      } catch {
        // default to cash
      }

      setSelectedOrder(null);
      setRefundOrder({
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        originalPaymentMethod: originalMethod,
        originalApprovalCode,
      });
    },
    [orders],
  );

  const handleRefundClose = useCallback(() => {
    setRefundOrder(null);
    loadOrders();
  }, [loadOrders]);

  const filtered = orders.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'active') return ACTIVE_STATUSES.includes(o.status);
    if (filter === 'completed') return o.status === 'completed';
    if (filter === 'cancelled') return o.status === 'cancelled';
    return true;
  });

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Orders</Text>
        <Text style={styles.screenSubtitle}>Last 7 days</Text>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
            onPress={() => setFilter(tab.key)}
          >
            <Text style={[styles.filterTabText, filter === tab.key && styles.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Order list */}
      <ScrollView style={styles.orderList} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No orders</Text>
          </View>
        ) : (
          filtered.map((order) => {
            const time = new Date(order.createdAt);
            const timeStr = time.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <TouchableOpacity
                key={order.id}
                style={styles.orderRow}
                onPress={() => setSelectedOrder(order)}
                activeOpacity={0.6}
              >
                <View style={styles.orderRowLeft}>
                  <Text style={styles.orderRowNumber}>{order.orderNumber}</Text>
                  <Text style={styles.orderRowTime}>{timeStr}</Text>
                </View>
                <View style={styles.orderRowCenter}>
                  <StatusBadge status={order.status} />
                  {order.customerName && (
                    <Text style={styles.orderRowCustomer} numberOfLines={1}>
                      {order.customerName}
                    </Text>
                  )}
                </View>
                <View style={styles.orderRowRight}>
                  <View style={styles.orderRowTotalRow}>
                    <Text style={styles.orderRowTotal}>${order.total.toFixed(2)}</Text>
                    <Text
                      style={[
                        styles.syncBadge,
                        order.syncStatus === 'synced'
                          ? styles.syncBadgeSynced
                          : styles.syncBadgePending,
                      ]}
                    >
                      {order.syncStatus === 'synced' ? '\u2713' : '\u23F3'}
                    </Text>
                  </View>
                  <Text style={styles.orderRowItems}>
                    {order.itemCount} item{order.itemCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Detail modal */}
      <OrderDetailModal
        order={selectedOrder}
        visible={selectedOrder !== null}
        onClose={() => setSelectedOrder(null)}
        onManage={handleManageOrder}
        onRefund={handleRefund}
      />

      {/* Refund modal */}
      <RefundScreen
        visible={refundOrder !== null}
        order={refundOrder}
        onClose={handleRefundClose}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Screen header
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    gap: 8,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#999',
  },

  // Filter tabs
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  filterTabActive: {
    backgroundColor: '#1a1a1a',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  filterTabTextActive: {
    color: '#fff',
  },

  // Order list
  orderList: {
    flex: 1,
    paddingTop: 8,
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
  },

  // Order row
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
  },
  orderRowLeft: {
    minWidth: 80,
  },
  orderRowNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  orderRowTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  orderRowCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
  },
  orderRowCustomer: {
    fontSize: 12,
    color: '#666',
    maxWidth: 120,
  },
  orderRowRight: {
    alignItems: 'flex-end',
  },
  orderRowTotalRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
  },
  orderRowTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  syncBadge: {
    fontSize: 12,
    width: 20,
    textAlign: 'center' as const,
  },
  syncBadgeSynced: {
    color: '#16a34a',
  },
  syncBadgePending: {
    color: '#d97706',
  },
  orderRowItems: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },

  // Status badge
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Detail modal
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  detailSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  detailOrderNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  detailMeta: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
  },
  detailItems: {
    paddingHorizontal: 20,
    maxHeight: 300,
  },
  detailItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  detailItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  detailItemNameVoided: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  detailItemMods: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  detailItemNotes: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#888',
    marginTop: 2,
  },
  detailItemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  detailItemTotalVoided: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  detailOverrideBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  detailOverrideBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563eb',
  },
  detailOverrideReason: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#2563eb',
    marginTop: 2,
  },
  detailItemPriceCol: {
    alignItems: 'flex-end',
  },
  detailItemTotalStrikethrough: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  detailItemTotalOverride: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  detailVoidBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  detailVoidBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  detailVoidReason: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#dc2626',
    marginTop: 2,
  },
  detailNotes: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
  },
  detailNotesText: {
    fontSize: 13,
    color: '#991b1b',
  },
  detailTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  detailTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  detailTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  manageButton: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  manageButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  refundButton: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#8b5cf6',
    alignItems: 'center',
  },
  refundButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Reprint receipt button
  reprintButton: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#0284c7',
    alignItems: 'center',
  },
  reprintButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },

  // Reprint preview area
  reprintContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  reprintPreviewWrapper: {
    alignItems: 'center',
    marginBottom: 12,
  },
  reprintActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  reprintPrintButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    alignItems: 'center',
  },
  reprintPrintButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  reprintEmailButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#0284c7',
    borderRadius: 10,
    alignItems: 'center',
  },
  reprintEmailButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  reprintBackButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    alignItems: 'center',
  },
  reprintBackButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  buttonDisabled: {
    opacity: 0.4,
  },

  // Reprint email input
  reprintEmailContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  reprintEmailInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    marginBottom: 8,
  },
  reprintEmailRow: {
    flexDirection: 'row',
    gap: 8,
  },
  reprintEmailSend: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#10b981',
    borderRadius: 8,
    alignItems: 'center',
  },
  reprintEmailSendText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  reprintEmailCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
  },
  reprintEmailCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },

  detailCloseButton: {
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  detailCloseText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
});
