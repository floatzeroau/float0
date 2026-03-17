import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { useOrder } from '../state/order-store';
import type { CartItemData } from '../state/order-store';
import { CustomerSearchModal } from './CustomerSearchModal';
import type { CustomerResult } from './CustomerSearchModal';
import { HeldOrdersDrawer } from './HeldOrdersDrawer';

// ---------------------------------------------------------------------------
// CartItem Row
// ---------------------------------------------------------------------------

interface CartItemRowProps {
  item: CartItemData;
  onQuantityChange: (itemId: string, newQty: number) => void;
  onRemove: (itemId: string) => void;
  onEdit: (item: CartItemData) => void;
  onNoteChange: (itemId: string, note: string) => void;
}

function CartItemRow({ item, onQuantityChange, onRemove, onEdit, onNoteChange }: CartItemRowProps) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState(item.notes);

  const handleNoteSubmit = useCallback(() => {
    onNoteChange(item.id, noteText);
    setShowNoteInput(false);
  }, [item.id, noteText, onNoteChange]);

  const hasModifiers = item.modifiers.length > 0;

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemMain}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.productName}</Text>
          {hasModifiers && (
            <Text style={styles.itemModifiers}>{item.modifiers.map((m) => m.name).join(', ')}</Text>
          )}
          {item.notes !== '' && !showNoteInput && (
            <Text style={styles.itemNotes}>{item.notes}</Text>
          )}
        </View>
        <Text style={styles.itemTotal}>${item.lineTotal.toFixed(2)}</Text>
      </View>

      {/* Quantity controls */}
      <View style={styles.itemControls}>
        <View style={styles.qtyGroup}>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => onQuantityChange(item.id, item.quantity - 1)}
          >
            <Text style={styles.qtyButtonText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => onQuantityChange(item.id, item.quantity + 1)}
          >
            <Text style={styles.qtyButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionGroup}>
          {hasModifiers && (
            <>
              <TouchableOpacity onPress={() => onEdit(item)}>
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <Text style={styles.actionDivider}>|</Text>
            </>
          )}
          <TouchableOpacity
            onPress={() => {
              setShowNoteInput(!showNoteInput);
              setNoteText(item.notes);
            }}
          >
            <Text style={styles.actionText}>Note</Text>
          </TouchableOpacity>
          <Text style={styles.actionDivider}>|</Text>
          <TouchableOpacity onPress={() => onRemove(item.id)}>
            <Text style={[styles.actionText, styles.actionRemove]}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Inline note input */}
      {showNoteInput && (
        <View style={styles.noteInputRow}>
          <TextInput
            style={styles.noteInput}
            placeholder="Add a note..."
            placeholderTextColor="#999"
            value={noteText}
            onChangeText={setNoteText}
            onSubmitEditing={handleNoteSubmit}
            autoFocus
          />
          <TouchableOpacity style={styles.noteSaveButton} onPress={handleNoteSubmit}>
            <Text style={styles.noteSaveText}>Save</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// CartSidebar
// ---------------------------------------------------------------------------

interface CartSidebarProps {
  onEditItem?: (item: CartItemData) => void;
}

export function CartSidebar({ onEditItem }: CartSidebarProps) {
  const {
    currentOrder,
    items,
    cartTotals,
    updateItemQuantity,
    removeItem,
    addItemNote,
    setCustomer,
    submitOrder,
    cancelOrder,
    holdOrder,
    heldOrders,
    refreshHeldOrders,
  } = useOrder();
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showHeldOrders, setShowHeldOrders] = useState(false);

  useEffect(() => {
    refreshHeldOrders();
  }, [refreshHeldOrders]);

  const handleQuantityChange = useCallback(
    (itemId: string, newQty: number) => {
      updateItemQuantity(itemId, newQty);
    },
    [updateItemQuantity],
  );

  const handleRemove = useCallback(
    (itemId: string) => {
      removeItem(itemId);
    },
    [removeItem],
  );

  const handleEdit = useCallback(
    (item: CartItemData) => {
      onEditItem?.(item);
    },
    [onEditItem],
  );

  const handleNoteChange = useCallback(
    (itemId: string, note: string) => {
      addItemNote(itemId, note);
    },
    [addItemNote],
  );

  const handleCustomerSelect = useCallback(
    (customer: CustomerResult) => {
      setCustomer(customer.id);
      setShowCustomerSearch(false);
    },
    [setCustomer],
  );

  const handleRemoveCustomer = useCallback(() => {
    setCustomer(null);
  }, [setCustomer]);

  const handleCancelOrder = useCallback(() => {
    setShowMenu(false);
    Alert.alert('Cancel Order', 'Are you sure? This cannot be undone.', [
      { text: 'Keep Order', style: 'cancel' },
      {
        text: 'Cancel Order',
        style: 'destructive',
        onPress: () => {
          if (Alert.prompt) {
            Alert.prompt('Reason', 'Why is this order being cancelled?', [
              { text: 'Skip', onPress: () => cancelOrder('No reason given') },
              {
                text: 'Confirm',
                onPress: (reason) => cancelOrder(reason || 'No reason given'),
              },
            ]);
          } else {
            cancelOrder('Cancelled by staff');
          }
        },
      },
    ]);
  }, [cancelOrder]);

  const hasItems = items.length > 0;

  // Order type badge text
  const orderTypeBadge = currentOrder
    ? currentOrder.orderType === 'takeaway'
      ? 'Takeaway'
      : `Dine-in${currentOrder.tableNumber ? ` #${currentOrder.tableNumber}` : ''}`
    : '';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerOrder}>{currentOrder?.orderNumber ?? 'No Order'}</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.heldButton} onPress={() => setShowHeldOrders(true)}>
              <Text style={styles.heldButtonText}>Held</Text>
              {heldOrders.length > 0 && (
                <View style={styles.heldBadge}>
                  <Text style={styles.heldBadgeText}>{heldOrders.length}</Text>
                </View>
              )}
            </TouchableOpacity>
            {currentOrder && (
              <View style={styles.orderTypeBadge}>
                <Text style={styles.orderTypeBadgeText}>{orderTypeBadge}</Text>
              </View>
            )}
            {currentOrder && hasItems && (
              <TouchableOpacity style={styles.menuButton} onPress={() => setShowMenu(!showMenu)}>
                <Text style={styles.menuButtonText}>...</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {showMenu && (
          <View style={styles.menuDropdown}>
            <TouchableOpacity style={styles.menuItem} onPress={handleCancelOrder}>
              <Text style={styles.menuItemTextDanger}>Cancel Order</Text>
            </TouchableOpacity>
          </View>
        )}
        {currentOrder && (
          <View style={styles.customerRow}>
            {currentOrder.customerName ? (
              <View style={styles.customerAssigned}>
                <Text style={styles.customerName} numberOfLines={1}>
                  {currentOrder.customerName}
                </Text>
                <TouchableOpacity onPress={handleRemoveCustomer} style={styles.customerRemove}>
                  <Text style={styles.customerRemoveText}>X</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addCustomerButton}
                onPress={() => setShowCustomerSearch(true)}
              >
                <Text style={styles.addCustomerText}>+ Customer</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Item list */}
      {hasItems ? (
        <ScrollView style={styles.itemList} showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              onQuantityChange={handleQuantityChange}
              onRemove={handleRemove}
              onEdit={handleEdit}
              onNoteChange={handleNoteChange}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No items yet</Text>
        </View>
      )}

      {/* Totals */}
      <View style={styles.totalsSection}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>${cartTotals.subtotal.toFixed(2)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>GST (10%)</Text>
          <Text style={styles.totalValue}>${cartTotals.gstAmount.toFixed(2)}</Text>
        </View>
        <View style={[styles.totalRow, styles.grandTotalRow]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>${cartTotals.total.toFixed(2)}</Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.holdButton]}
          onPress={holdOrder}
          disabled={!hasItems}
        >
          <Text style={[styles.holdButtonText, !hasItems && styles.disabledText]}>Hold</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.submitButton, !hasItems && styles.disabledButton]}
          onPress={submitOrder}
          disabled={!hasItems}
        >
          <Text style={[styles.submitButtonText, !hasItems && styles.disabledSubmitText]}>
            Submit
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.payButton]} disabled>
          <Text style={styles.payButtonText}>${cartTotals.total.toFixed(2)}</Text>
          <Text style={styles.payComingSoon}>Coming Soon</Text>
        </TouchableOpacity>
      </View>

      <CustomerSearchModal
        visible={showCustomerSearch}
        onSelect={handleCustomerSelect}
        onCancel={() => setShowCustomerSearch(false)}
      />

      <HeldOrdersDrawer visible={showHeldOrders} onClose={() => setShowHeldOrders(false)} />
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

  // Header
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heldButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    gap: 4,
  },
  heldButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  heldBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  heldBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  menuButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#666',
    marginTop: -4,
  },
  menuDropdown: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuItemTextDanger: {
    fontSize: 13,
    fontWeight: '600',
    color: '#dc2626',
  },
  headerOrder: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  orderTypeBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  orderTypeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },

  // Customer
  customerRow: {
    marginTop: 8,
  },
  addCustomerButton: {
    paddingVertical: 4,
  },
  addCustomerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  customerAssigned: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  customerName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a6ed8',
    maxWidth: 160,
  },
  customerRemove: {
    marginLeft: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerRemoveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1a6ed8',
  },

  // Item list
  itemList: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },

  // Item row
  itemRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  itemModifiers: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  itemNotes: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#888',
    marginTop: 2,
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },

  // Quantity & actions
  itemControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  qtyGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    minWidth: 20,
    textAlign: 'center',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 12,
    color: '#888',
  },
  actionDivider: {
    fontSize: 12,
    color: '#ddd',
  },
  actionRemove: {
    color: '#dc2626',
  },

  // Note input
  noteInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  noteInput: {
    flex: 1,
    height: 32,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 12,
    color: '#1a1a1a',
  },
  noteSaveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
  },
  noteSaveText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  // Totals
  totalsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 13,
    color: '#666',
  },
  totalValue: {
    fontSize: 13,
    color: '#666',
  },
  grandTotalRow: {
    marginTop: 4,
    marginBottom: 0,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  // Actions
  actions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdButton: {
    backgroundColor: '#f0f0f0',
  },
  holdButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    backgroundColor: '#1a1a1a',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  disabledSubmitText: {
    color: '#fff',
  },
  disabledText: {
    color: '#bbb',
  },
  payButton: {
    backgroundColor: '#e8e8e8',
  },
  payButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  payComingSoon: {
    fontSize: 9,
    color: '#bbb',
    marginTop: 1,
  },
});
