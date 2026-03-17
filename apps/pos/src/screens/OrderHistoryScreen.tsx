import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Order, OrderItem, Product, Customer } from '../db/models';
import { STATUS_LABELS, STATUS_COLOURS } from '../state/order-lifecycle';
import type { OrderStatusDB } from '../state/order-lifecycle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
}

interface OrderDetailItem {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: { name: string }[];
  notes: string;
}

type FilterTab = 'all' | 'active' | 'completed' | 'cancelled';

const ACTIVE_STATUSES: OrderStatusDB[] = ['draft', 'submitted', 'in_progress', 'ready'];

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
}: {
  order: OrderRow | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<OrderDetailItem[]>([]);

  useEffect(() => {
    if (!order || !visible) return;

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

          return {
            id: oi.id,
            productName,
            quantity: oi.quantity,
            unitPrice: oi.unitPrice,
            lineTotal: oi.lineTotal,
            modifiers: mods,
            notes: oi.notes ?? '',
          };
        }),
      );

      setItems(loaded);
    })();
  }, [order, visible]);

  if (!order) return null;

  const time = new Date(order.createdAt);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const typeLabel =
    order.orderType === 'dine_in'
      ? `Dine-in${order.tableNumber ? ` #${order.tableNumber}` : ''}`
      : 'Takeaway';

  return (
    <Modal visible={visible} animationType="slide" transparent>
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

          {/* Items */}
          <ScrollView style={styles.detailItems} showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <View key={item.id} style={styles.detailItemRow}>
                <View style={styles.detailItemInfo}>
                  <Text style={styles.detailItemName}>
                    {item.quantity}x {item.productName}
                  </Text>
                  {item.modifiers.length > 0 && (
                    <Text style={styles.detailItemMods}>
                      {item.modifiers.map((m) => m.name).join(', ')}
                    </Text>
                  )}
                  {item.notes !== '' && <Text style={styles.detailItemNotes}>{item.notes}</Text>}
                </View>
                <Text style={styles.detailItemTotal}>${item.lineTotal.toFixed(2)}</Text>
              </View>
            ))}
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

export default function OrderHistoryScreen() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);

  const loadOrders = useCallback(async () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const rows = await database
      .get<Order>('orders')
      .query(Q.where('created_at', Q.gte(startOfDay.getTime())), Q.sortBy('created_at', Q.desc))
      .fetch();

    const mapped: OrderRow[] = await Promise.all(
      rows.map(async (o) => {
        // Count items
        const itemRows = await database
          .get<OrderItem>('order_items')
          .query(Q.where('order_id', o.id))
          .fetch();

        let customerName: string | null = null;
        if (o.customerId) {
          try {
            const c = await database.get<Customer>('customers').find(o.customerId);
            customerName = [c.firstName, c.lastName].filter(Boolean).join(' ') || null;
          } catch {
            // deleted customer
          }
        }

        return {
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
        };
      }),
    );

    setOrders(mapped);
  }, []);

  useEffect(() => {
    loadOrders();
    // Refresh every 5 seconds
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
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
        <Text style={styles.screenSubtitle}>Today</Text>
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
                  <Text style={styles.orderRowTotal}>${order.total.toFixed(2)}</Text>
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
  orderRowTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
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
