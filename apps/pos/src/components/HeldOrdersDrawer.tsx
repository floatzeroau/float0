import React, { useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useOrder } from '../state/order-store';
import type { HeldOrderSummary } from '../state/order-store';
import { colors, spacing, radii, typography } from '../theme/tokens';

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
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
    flex: 1,
  },
  headerCount: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
    marginRight: spacing.lg,
  },
  closeButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.background,
    borderRadius: radii.md,
  },
  closeButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: '#333',
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxxl,
  },
  emptyTitle: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
  },
  emptySubtitle: {
    fontSize: typography.size.md,
    color: colors.textDisabled,
    marginTop: 6,
    textAlign: 'center',
  },

  // List
  list: {
    flex: 1,
    padding: spacing.md,
  },

  // Order row
  orderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 14,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  orderRowStale: {
    borderColor: colors.warning,
    backgroundColor: '#fffbeb',
  },
  orderRowLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  orderRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderNumber: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  staleBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: spacing.xxs,
    borderRadius: radii.xs,
  },
  staleBadgeText: {
    fontSize: typography.size.xxs,
    fontWeight: typography.weight.bold,
    color: colors.warningDark,
  },
  typeBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.lg,
  },
  typeBadgeText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  customerName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: '#1a6ed8',
    marginTop: spacing.xs,
  },
  orderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  metaText: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  metaDot: {
    fontSize: typography.size.sm,
    color: colors.textDisabled,
  },
  metaTextStale: {
    color: colors.warningDark,
    fontWeight: typography.weight.semibold,
  },
  orderRowRight: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  orderTotal: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  deleteButton: {
    width: 24,
    height: 24,
    borderRadius: radii.lg,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.danger,
  },
});
