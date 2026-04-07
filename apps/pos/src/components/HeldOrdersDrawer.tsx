import React, { useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useOrder } from '../state/order-store';
import type { HeldOrderSummary } from '../state/order-store';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ${diffMin % 60}m ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

function isOlderThan2Hours(timestampMs: number): boolean {
  return Date.now() - timestampMs > TWO_HOURS_MS;
}

// ---------------------------------------------------------------------------
// HeldOrderRow
// ---------------------------------------------------------------------------

interface HeldOrderRowProps {
  order: HeldOrderSummary;
  onRecall: (orderId: string) => void;
  onDelete: (orderId: string) => void;
}

function HeldOrderRow({ order, onRecall, onDelete }: HeldOrderRowProps) {
  const isStale = isOlderThan2Hours(order.heldAt);

  return (
    <TouchableOpacity
      style={[styles.orderRow, isStale && styles.orderRowStale]}
      onPress={() => onRecall(order.id)}
      activeOpacity={0.7}
    >
      <View style={styles.orderRowLeft}>
        <View style={styles.orderRowHeader}>
          <Text style={styles.orderNumber}>{order.orderNumber}</Text>
          {isStale && (
            <View style={styles.staleBadge}>
              <Text style={styles.staleBadgeText}>Stale</Text>
            </View>
          )}
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>
              {order.orderType === 'takeaway'
                ? 'Takeaway'
                : `Dine-in${order.tableNumber ? ` #${order.tableNumber}` : ''}`}
            </Text>
          </View>
        </View>
        {order.customerName && (
          <Text style={styles.customerName} numberOfLines={1}>
            {order.customerName}
          </Text>
        )}
        <View style={styles.orderMeta}>
          <Text style={styles.metaText}>
            {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
          </Text>
          <Text style={styles.metaDot}>&middot;</Text>
          <Text style={[styles.metaText, isStale && styles.metaTextStale]}>
            {formatRelativeTime(order.heldAt)}
          </Text>
        </View>
      </View>

      <View style={styles.orderRowRight}>
        <Text style={styles.orderTotal}>${order.total.toFixed(2)}</Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={(e) => {
            e.stopPropagation?.();
            onDelete(order.id);
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.deleteButtonText}>X</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// HeldOrdersDrawer
// ---------------------------------------------------------------------------

interface HeldOrdersDrawerProps {
  visible: boolean;
  onClose: () => void;
}

export function HeldOrdersDrawer({ visible, onClose }: HeldOrdersDrawerProps) {
  const { heldOrders, recallOrder, refreshHeldOrders } = useOrder();

  useEffect(() => {
    if (visible) {
      refreshHeldOrders();
    }
  }, [visible, refreshHeldOrders]);

  const handleRecall = (orderId: string) => {
    onClose();
    recallOrder(orderId);
  };

  const handleDelete = (orderId: string) => {
    const order = heldOrders.find((o) => o.id === orderId);
    Alert.alert(
      'Delete held order?',
      `${order?.orderNumber ?? 'This order'} will be cancelled and cannot be recovered.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Import database directly to avoid circular deps
              const { database } = await import('../db/database');
              const { transitionOrder } = await import('../state/order-lifecycle');
              await transitionOrder(orderId, 'cancelled');
              await database.write(async () => {
                const record = await database.get('orders').find(orderId);
                await record.update((o: any) => {
                  (o._raw as any).notes = 'Held order deleted';
                  (o._raw as any).held_at = 0;
                });
              });
              await refreshHeldOrders();
            } catch {
              Alert.alert('Error', 'Failed to delete held order.');
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      supportedOrientations={['landscape-left', 'landscape-right']}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Held Orders</Text>
          <Text style={styles.headerCount}>{heldOrders.length} held</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>

        {heldOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No held orders</Text>
            <Text style={styles.emptySubtitle}>Hold an order from the cart to park it here.</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {heldOrders.map((order) => (
              <HeldOrderRow
                key={order.id}
                order={order}
                onRecall={handleRecall}
                onDelete={handleDelete}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8f8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  headerCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginRight: 16,
  },
  closeButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#bbb',
    marginTop: 6,
    textAlign: 'center',
  },

  // List
  list: {
    flex: 1,
    padding: 12,
  },

  // Order row
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  orderRowStale: {
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
  },
  orderRowLeft: {
    flex: 1,
    marginRight: 12,
  },
  orderRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  staleBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  staleBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#d97706',
  },
  typeBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  customerName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a6ed8',
    marginTop: 4,
  },
  orderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#888',
  },
  metaDot: {
    fontSize: 12,
    color: '#ccc',
  },
  metaTextStale: {
    color: '#d97706',
    fontWeight: '600',
  },
  orderRowRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  orderTotal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  deleteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#dc2626',
  },
});
