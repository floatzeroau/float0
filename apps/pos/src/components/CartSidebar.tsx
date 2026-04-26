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
import * as SecureStore from 'expo-secure-store';
import { useOrder } from '../state/order-store';
import type { CartItemData } from '../state/order-store';
import { CustomerSearchModal } from './CustomerSearchModal';
import type { CustomerResult } from './CustomerSearchModal';
import { HeldOrdersDrawer } from './HeldOrdersDrawer';
import { DiscountModal } from './DiscountModal';
import { VoidItemModal } from './VoidItemModal';
import { PriceOverrideModal } from './PriceOverrideModal';
import { SellPackModal } from './SellPackModal';
import { ConvertToPackModal } from './ConvertToPackModal';
import type { OrgCafePackSettings } from './ConvertToPackModal';
import { database } from '../db/database';
import type { Customer } from '../db/models';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import type { DiscountType } from '@float0/shared';

// ---------------------------------------------------------------------------
// CartItem Row
// ---------------------------------------------------------------------------

interface CartItemRowProps {
  item: CartItemData;
  isSubmittedOrder: boolean;
  hasCustomer: boolean;
  onQuantityChange: (itemId: string, newQty: number) => void;
  onRemove: (itemId: string) => void;
  onEdit: (item: CartItemData) => void;
  onNoteChange: (itemId: string, note: string) => void;
  onDiscount: (item: CartItemData) => void;
  onVoid: (item: CartItemData) => void;
  onPriceOverride: (item: CartItemData) => void;
  onConvertToPack: (item: CartItemData) => void;
  onUndoPack: (item: CartItemData) => void;
}

function CartItemRow({
  item,
  isSubmittedOrder,
  hasCustomer,
  onQuantityChange,
  onRemove,
  onEdit,
  onNoteChange,
  onDiscount,
  onVoid,
  onPriceOverride,
  onConvertToPack,
  onUndoPack,
}: CartItemRowProps) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState(item.notes);

  const handleNoteSubmit = useCallback(() => {
    onNoteChange(item.id, noteText);
    setShowNoteInput(false);
  }, [item.id, noteText, onNoteChange]);

  const hasModifiers = item.modifiers.length > 0;
  const hasDiscount = item.discountType && item.discountValue > 0;
  const discountedTotal = hasDiscount ? item.lineTotal - item.discountAmount : item.lineTotal;
  const isVoided = item.voidedAt > 0;
  const hasOverride = item.overridePrice > 0;

  // Voided item rendering
  if (isVoided) {
    return (
      <View style={[styles.itemRow, styles.itemRowVoided]}>
        <View style={styles.itemMain}>
          <View style={styles.itemInfo}>
            <Text style={[styles.itemName, styles.itemNameVoided]}>{item.productName}</Text>
            {hasModifiers && (
              <Text style={[styles.itemModifiers, styles.textStrikethrough]}>
                {item.modifiers.map((m) => m.name).join(', ')}
              </Text>
            )}
            <View style={styles.voidBadge}>
              <Text style={styles.voidBadgeText}>VOID</Text>
            </View>
            {item.voidReason !== '' && <Text style={styles.voidReasonText}>{item.voidReason}</Text>}
          </View>
          <View style={styles.itemPriceCol}>
            <Text style={[styles.itemTotal, styles.itemTotalVoided]}>
              ${item.lineTotal.toFixed(2)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  // Submitted order item (not voided): show Void button, quantity display only
  if (isSubmittedOrder) {
    return (
      <View style={styles.itemRow}>
        <View style={styles.itemMain}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.productName}</Text>
            {hasModifiers && (
              <Text style={styles.itemModifiers}>
                {item.modifiers.map((m) => m.name).join(', ')}
              </Text>
            )}
            {hasOverride && (
              <View style={styles.overrideBadge}>
                <Text style={styles.overrideBadgeText}>OVERRIDE</Text>
              </View>
            )}
            {hasOverride && item.overrideReason !== '' && (
              <Text style={styles.overrideReasonText}>{item.overrideReason}</Text>
            )}
            {hasDiscount && <Text style={styles.itemDiscountReason}>{item.discountReason}</Text>}
            {item.notes !== '' && <Text style={styles.itemNotes}>{item.notes}</Text>}
          </View>
          <View style={styles.itemPriceCol}>
            {hasOverride ? (
              <>
                <Text style={styles.itemTotalStrikethrough}>${item.unitPrice.toFixed(2)}</Text>
                <Text style={styles.itemTotalOverride}>${item.overridePrice.toFixed(2)}</Text>
              </>
            ) : hasDiscount ? (
              <>
                <Text style={styles.itemTotalStrikethrough}>${item.lineTotal.toFixed(2)}</Text>
                <Text style={styles.itemTotalDiscounted}>${discountedTotal.toFixed(2)}</Text>
              </>
            ) : (
              <Text style={styles.itemTotal}>${item.lineTotal.toFixed(2)}</Text>
            )}
          </View>
        </View>
        <View style={styles.itemControls}>
          <Text style={styles.qtyText}>Qty: {item.quantity}</Text>
          <View style={styles.submittedActions}>
            <TouchableOpacity
              style={styles.priceOverrideButton}
              onPress={() => onPriceOverride(item)}
            >
              <Text style={styles.priceOverrideButtonText}>Price</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.voidItemButton} onPress={() => onVoid(item)}>
              <Text style={styles.voidItemButtonText}>Void Item</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Pack item rendering (locked)
  if (item.isPackPurchase) {
    return (
      <View style={[styles.itemRow, styles.itemRowPack]}>
        <View style={styles.itemMain}>
          <View style={styles.itemInfo}>
            <View style={styles.packNameRow}>
              <Text style={styles.packLockIcon}>🔒</Text>
              <Text style={styles.itemName}>
                PACK: {item.packTotalQuantity} × {item.productName}
              </Text>
            </View>
            {hasModifiers && (
              <Text style={styles.itemModifiers}>
                {item.modifiers.map((m) => m.name).join(', ')}
              </Text>
            )}
            <View style={styles.packBadge}>
              <Text style={styles.packBadgeText}>CAFE PACK</Text>
            </View>
          </View>
          <View style={styles.itemPriceCol}>
            <Text style={styles.itemTotal}>${item.lineTotal.toFixed(2)}</Text>
          </View>
        </View>
        <View style={styles.itemControls}>
          <Text style={styles.qtyText}>Qty: 1 (pack)</Text>
          <View style={styles.actionGroup}>
            <TouchableOpacity onPress={() => onUndoPack(item)}>
              <Text style={[styles.actionText, styles.actionTextBlue]}>Undo Pack</Text>
            </TouchableOpacity>
            <Text style={styles.actionDivider}>|</Text>
            <TouchableOpacity onPress={() => onRemove(item.id)}>
              <Text style={[styles.actionText, styles.actionRemove]}>Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // Normal draft item rendering
  const showPackAction = item.allowAsPack && hasCustomer && !isSubmittedOrder;

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemMain}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.productName}</Text>
          {hasModifiers && (
            <Text style={styles.itemModifiers}>{item.modifiers.map((m) => m.name).join(', ')}</Text>
          )}
          {hasOverride && (
            <View style={styles.overrideBadge}>
              <Text style={styles.overrideBadgeText}>OVERRIDE</Text>
            </View>
          )}
          {hasOverride && item.overrideReason !== '' && (
            <Text style={styles.overrideReasonText}>{item.overrideReason}</Text>
          )}
          {hasDiscount && <Text style={styles.itemDiscountReason}>{item.discountReason}</Text>}
          {item.notes !== '' && !showNoteInput && (
            <Text style={styles.itemNotes}>{item.notes}</Text>
          )}
        </View>
        <View style={styles.itemPriceCol}>
          {hasOverride ? (
            <>
              <Text style={styles.itemTotalStrikethrough}>${item.unitPrice.toFixed(2)}</Text>
              <Text style={styles.itemTotalOverride}>${item.overridePrice.toFixed(2)}</Text>
            </>
          ) : hasDiscount ? (
            <>
              <Text style={styles.itemTotalStrikethrough}>${item.lineTotal.toFixed(2)}</Text>
              <Text style={styles.itemTotalDiscounted}>${discountedTotal.toFixed(2)}</Text>
            </>
          ) : (
            <Text style={styles.itemTotal}>${item.lineTotal.toFixed(2)}</Text>
          )}
        </View>
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
          {showPackAction && (
            <>
              <TouchableOpacity onPress={() => onConvertToPack(item)}>
                <Text style={[styles.actionText, styles.actionTextPack]}>Pack</Text>
              </TouchableOpacity>
              <Text style={styles.actionDivider}>|</Text>
            </>
          )}
          {hasModifiers && (
            <>
              <TouchableOpacity onPress={() => onEdit(item)}>
                <Text style={styles.actionText}>Edit</Text>
              </TouchableOpacity>
              <Text style={styles.actionDivider}>|</Text>
            </>
          )}
          <TouchableOpacity onPress={() => onDiscount(item)}>
            <Text style={[styles.actionText, hasDiscount && styles.actionTextGreen]}>Discount</Text>
          </TouchableOpacity>
          <Text style={styles.actionDivider}>|</Text>
          <TouchableOpacity onPress={() => onPriceOverride(item)}>
            <Text style={[styles.actionText, hasOverride && styles.actionTextBlue]}>Price</Text>
          </TouchableOpacity>
          <Text style={styles.actionDivider}>|</Text>
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
  onPay?: () => void;
}

export function CartSidebar({ onEditItem, onPay }: CartSidebarProps) {
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
    orderDiscount,
    applyOrderDiscount,
    applyItemDiscount,
    removeOrderDiscount,
    removeItemDiscount,
    isManagingSubmittedOrder,
    voidItem,
    overrideItemPrice,
    returnToNewOrder,
    convertItemToPack,
    undoPackConversion,
  } = useOrder();
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showHeldOrders, setShowHeldOrders] = useState(false);
  const [showSellPack, setShowSellPack] = useState(false);
  const [customerBalances, setCustomerBalances] = useState<
    { id: string; packName: string; remainingCount: number; originalCount: number }[]
  >([]);

  // Fetch prepaid balances when customer is attached
  useEffect(() => {
    if (!currentOrder?.customerId) {
      setCustomerBalances([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const cust = await database.get<Customer>('customers').find(currentOrder.customerId!);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const serverId = (cust._raw as any).server_id as string;
        const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);

        const res = await fetch(`${API_URL}/customers/${serverId}/balances`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok && !cancelled) {
          const data = await res.json();
          setCustomerBalances(data);
        }
      } catch {
        // silently fail — balances are informational
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentOrder?.customerId]);

  // Discount modal state
  const [discountModalVisible, setDiscountModalVisible] = useState(false);
  const [discountTarget, setDiscountTarget] = useState<{
    mode: 'order' | 'item';
    itemId?: string;
    itemName?: string;
    currentTotal: number;
    existing: { type: DiscountType; value: number; reason: string } | null;
  } | null>(null);

  // Void modal state
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [voidTargetItem, setVoidTargetItem] = useState<{
    id: string;
    productName: string;
    lineTotal: number;
    quantity: number;
  } | null>(null);

  // Price override modal state
  const [priceOverrideModalVisible, setPriceOverrideModalVisible] = useState(false);
  const [priceOverrideTargetItem, setPriceOverrideTargetItem] = useState<{
    id: string;
    productName: string;
    unitPrice: number;
    lineTotal: number;
    quantity: number;
    modifiers: { id: string; name: string; priceAdjustment: number }[];
  } | null>(null);

  // Convert to Pack modal state
  const [packModalVisible, setPackModalVisible] = useState(false);
  const [packTargetItem, setPackTargetItem] = useState<CartItemData | null>(null);
  const [cafePackSettings, setCafePackSettings] = useState<OrgCafePackSettings>({
    enabled: false,
    expiryMode: 'none',
    expiryDays: null,
  });

  // Fetch cafe pack settings on mount
  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
        const res = await fetch(`${API_URL}/organization`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const org = await res.json();
          const cp = org?.settings?.cafePack;
          if (cp) {
            setCafePackSettings({
              enabled: cp.enabled === true,
              expiryMode: cp.expiryMode ?? 'none',
              expiryDays: cp.expiryDays ?? null,
            });
          }
        }
      } catch {
        // silently fail — use defaults
      }
    })();
  }, []);

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

  // Discount handlers
  const handleOpenItemDiscount = useCallback((item: CartItemData) => {
    setDiscountTarget({
      mode: 'item',
      itemId: item.id,
      itemName: item.productName,
      currentTotal: item.lineTotal,
      existing:
        item.discountType && item.discountValue > 0
          ? { type: item.discountType, value: item.discountValue, reason: item.discountReason }
          : null,
    });
    setDiscountModalVisible(true);
  }, []);

  const handleOpenOrderDiscount = useCallback(() => {
    setShowMenu(false);
    setDiscountTarget({
      mode: 'order',
      currentTotal: cartTotals.subtotal,
      existing: orderDiscount
        ? { type: orderDiscount.type, value: orderDiscount.value, reason: orderDiscount.reason }
        : null,
    });
    setDiscountModalVisible(true);
  }, [cartTotals.subtotal, orderDiscount]);

  const handleDiscountApply = useCallback(
    (type: DiscountType, value: number, reason: string) => {
      if (!discountTarget) return;
      if (discountTarget.mode === 'order') {
        applyOrderDiscount(type, value, reason);
      } else if (discountTarget.itemId) {
        applyItemDiscount(discountTarget.itemId, type, value, reason);
      }
      setDiscountModalVisible(false);
      setDiscountTarget(null);
    },
    [discountTarget, applyOrderDiscount, applyItemDiscount],
  );

  const handleDiscountRemove = useCallback(() => {
    if (!discountTarget) return;
    if (discountTarget.mode === 'order') {
      removeOrderDiscount();
    } else if (discountTarget.itemId) {
      removeItemDiscount(discountTarget.itemId);
    }
    setDiscountModalVisible(false);
    setDiscountTarget(null);
  }, [discountTarget, removeOrderDiscount, removeItemDiscount]);

  const handleDiscountCancel = useCallback(() => {
    setDiscountModalVisible(false);
    setDiscountTarget(null);
  }, []);

  // Void handlers
  const handleOpenVoid = useCallback((item: CartItemData) => {
    setVoidTargetItem({
      id: item.id,
      productName: item.productName,
      lineTotal: item.lineTotal,
      quantity: item.quantity,
    });
    setVoidModalVisible(true);
  }, []);

  const handleVoidConfirm = useCallback(
    (reason: string, managerApprover?: string) => {
      if (!voidTargetItem) return;
      voidItem(voidTargetItem.id, reason, managerApprover);
      setVoidModalVisible(false);
      setVoidTargetItem(null);
    },
    [voidTargetItem, voidItem],
  );

  const handleVoidCancel = useCallback(() => {
    setVoidModalVisible(false);
    setVoidTargetItem(null);
  }, []);

  // Price override handlers
  const handleOpenPriceOverride = useCallback((item: CartItemData) => {
    setPriceOverrideTargetItem({
      id: item.id,
      productName: item.productName,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      quantity: item.quantity,
      modifiers: item.modifiers,
    });
    setPriceOverrideModalVisible(true);
  }, []);

  const handlePriceOverrideConfirm = useCallback(
    (newPrice: number, reason: string, managerApprover: string) => {
      if (!priceOverrideTargetItem) return;
      overrideItemPrice(priceOverrideTargetItem.id, newPrice, reason, managerApprover);
      setPriceOverrideModalVisible(false);
      setPriceOverrideTargetItem(null);
    },
    [priceOverrideTargetItem, overrideItemPrice],
  );

  const handlePriceOverrideCancel = useCallback(() => {
    setPriceOverrideModalVisible(false);
    setPriceOverrideTargetItem(null);
  }, []);

  // Convert to Pack handlers
  const handleOpenConvertToPack = useCallback((item: CartItemData) => {
    setPackTargetItem(item);
    setPackModalVisible(true);
  }, []);

  const handlePackConfirm = useCallback(
    (
      itemId: string,
      packTotalQuantity: number,
      packPrice: number,
      packExpiryDate: string | null,
    ) => {
      convertItemToPack(itemId, packTotalQuantity, packPrice, packExpiryDate);
      setPackModalVisible(false);
      setPackTargetItem(null);
    },
    [convertItemToPack],
  );

  const handlePackCancel = useCallback(() => {
    setPackModalVisible(false);
    setPackTargetItem(null);
  }, []);

  const handleUndoPack = useCallback(
    (item: CartItemData) => {
      undoPackConversion(item.id);
    },
    [undoPackConversion],
  );

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
            {!isManagingSubmittedOrder && (
              <TouchableOpacity style={styles.heldButton} onPress={() => setShowHeldOrders(true)}>
                <Text style={styles.heldButtonText}>Held</Text>
                {heldOrders.length > 0 && (
                  <View style={styles.heldBadge}>
                    <Text style={styles.heldBadgeText}>{heldOrders.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            {isManagingSubmittedOrder && currentOrder && (
              <View style={styles.submittedBadge}>
                <Text style={styles.submittedBadgeText}>{currentOrder.status.toUpperCase()}</Text>
              </View>
            )}
            {currentOrder && (
              <View style={styles.orderTypeBadge}>
                <Text style={styles.orderTypeBadgeText}>{orderTypeBadge}</Text>
              </View>
            )}
            {!isManagingSubmittedOrder && currentOrder && hasItems && (
              <TouchableOpacity style={styles.menuButton} onPress={() => setShowMenu(!showMenu)}>
                <Text style={styles.menuButtonText}>...</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        {showMenu && !isManagingSubmittedOrder && (
          <View style={styles.menuDropdown}>
            <TouchableOpacity style={styles.menuItem} onPress={handleOpenOrderDiscount}>
              <Text style={styles.menuItemText}>
                {orderDiscount ? 'Edit Order Discount' : 'Apply Order Discount'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={handleCancelOrder}>
              <Text style={styles.menuItemTextDanger}>Cancel Order</Text>
            </TouchableOpacity>
          </View>
        )}
        {currentOrder && !isManagingSubmittedOrder && (
          <View style={styles.customerRow}>
            {currentOrder.customerName ? (
              <>
                <View style={styles.customerAssigned}>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {currentOrder.customerName}
                  </Text>
                  <TouchableOpacity onPress={handleRemoveCustomer} style={styles.customerRemove}>
                    <Text style={styles.customerRemoveText}>X</Text>
                  </TouchableOpacity>
                </View>
                {customerBalances.length > 0 && (
                  <View style={styles.balanceRow}>
                    {customerBalances.map((b) => (
                      <View key={b.id} style={styles.balanceBadge}>
                        <Text style={styles.balanceBadgeText}>
                          {b.packName}: {b.remainingCount}/{b.originalCount}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {currentOrder.customerId && (
                  <TouchableOpacity
                    style={styles.sellPackButton}
                    onPress={() => {
                      setShowMenu(false);
                      setShowSellPack(true);
                    }}
                  >
                    <Text style={styles.sellPackText}>Sell Pack</Text>
                  </TouchableOpacity>
                )}
              </>
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
              isSubmittedOrder={isManagingSubmittedOrder}
              hasCustomer={!!currentOrder?.customerId && cafePackSettings.enabled}
              onQuantityChange={handleQuantityChange}
              onRemove={handleRemove}
              onEdit={handleEdit}
              onNoteChange={handleNoteChange}
              onDiscount={handleOpenItemDiscount}
              onVoid={handleOpenVoid}
              onPriceOverride={handleOpenPriceOverride}
              onConvertToPack={handleOpenConvertToPack}
              onUndoPack={handleUndoPack}
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
        {cartTotals.itemDiscountTotal > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabelGreen}>Item Discounts</Text>
            <Text style={styles.totalValueGreen}>-${cartTotals.itemDiscountTotal.toFixed(2)}</Text>
          </View>
        )}
        {cartTotals.orderDiscountAmount > 0 && (
          <TouchableOpacity style={styles.totalRow} onPress={handleOpenOrderDiscount}>
            <Text style={styles.totalLabelGreen}>
              Order Discount{orderDiscount ? ` (${orderDiscount.reason})` : ''}
            </Text>
            <Text style={styles.totalValueGreen}>
              -${cartTotals.orderDiscountAmount.toFixed(2)}
            </Text>
          </TouchableOpacity>
        )}
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
      {isManagingSubmittedOrder ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.doneButton]}
            onPress={returnToNewOrder}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.holdButtonStyle]}
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

          <TouchableOpacity
            style={[styles.actionButton, styles.payButton, !hasItems && styles.disabledButton]}
            onPress={onPay}
            disabled={!hasItems}
          >
            <Text style={[styles.payButtonText, !hasItems && styles.disabledSubmitText]}>
              Pay ${cartTotals.total.toFixed(2)}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <CustomerSearchModal
        visible={showCustomerSearch}
        onSelect={handleCustomerSelect}
        onCancel={() => setShowCustomerSearch(false)}
      />

      <HeldOrdersDrawer visible={showHeldOrders} onClose={() => setShowHeldOrders(false)} />

      {discountTarget && (
        <DiscountModal
          visible={discountModalVisible}
          mode={discountTarget.mode}
          itemName={discountTarget.itemName}
          currentTotal={discountTarget.currentTotal}
          existingDiscount={discountTarget.existing}
          onApply={handleDiscountApply}
          onRemove={handleDiscountRemove}
          onCancel={handleDiscountCancel}
        />
      )}

      <VoidItemModal
        visible={voidModalVisible}
        item={voidTargetItem}
        onConfirm={handleVoidConfirm}
        onCancel={handleVoidCancel}
      />

      <PriceOverrideModal
        visible={priceOverrideModalVisible}
        item={priceOverrideTargetItem}
        onConfirm={handlePriceOverrideConfirm}
        onCancel={handlePriceOverrideCancel}
      />

      <ConvertToPackModal
        visible={packModalVisible}
        item={packTargetItem}
        cafePackSettings={cafePackSettings}
        onConfirm={handlePackConfirm}
        onCancel={handlePackCancel}
      />

      {currentOrder?.customerId && (
        <SellPackModal
          visible={showSellPack}
          customerId={currentOrder.customerId}
          customerName={currentOrder.customerName ?? ''}
          onComplete={() => {
            setShowSellPack(false);
            // Refresh balances
            (async () => {
              try {
                const cust = await database
                  .get<Customer>('customers')
                  .find(currentOrder.customerId!);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const serverId = (cust._raw as any).server_id as string;
                const token = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);
                const res = await fetch(`${API_URL}/customers/${serverId}/balances`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                  setCustomerBalances(await res.json());
                }
              } catch {
                // ignore
              }
            })();
          }}
          onCancel={() => setShowSellPack(false)}
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
  submittedBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  submittedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563eb',
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
  menuItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
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
  balanceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  balanceBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  balanceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  sellPackButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  sellPackText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
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
  itemRowVoided: {
    backgroundColor: '#fef2f2',
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
  itemNameVoided: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  textStrikethrough: {
    textDecorationLine: 'line-through',
  },
  itemModifiers: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  itemDiscountReason: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#16a34a',
    marginTop: 2,
  },
  itemNotes: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#888',
    marginTop: 2,
  },
  itemPriceCol: {
    alignItems: 'flex-end',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  itemTotalVoided: {
    textDecorationLine: 'line-through',
    color: '#999',
  },
  itemTotalStrikethrough: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  itemTotalDiscounted: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16a34a',
  },

  // Void styles
  voidBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  voidBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  voidReasonText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#dc2626',
    marginTop: 2,
  },
  // Override styles
  overrideBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  overrideBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563eb',
  },
  overrideReasonText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#2563eb',
    marginTop: 2,
  },
  itemTotalOverride: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  submittedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  priceOverrideButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#eff6ff',
  },
  priceOverrideButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },

  voidItemButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
  voidItemButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
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
  actionTextGreen: {
    color: '#16a34a',
  },
  actionTextBlue: {
    color: '#2563eb',
  },
  actionDivider: {
    fontSize: 12,
    color: '#ddd',
  },
  actionRemove: {
    color: '#dc2626',
  },
  actionTextPack: {
    color: '#7c3aed',
    fontWeight: '600',
  },

  // Pack item styles
  itemRowPack: {
    backgroundColor: '#faf5ff',
    borderLeftWidth: 3,
    borderLeftColor: '#7c3aed',
  },
  packNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  packLockIcon: {
    fontSize: 12,
  },
  packBadge: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  packBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
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
  totalLabelGreen: {
    fontSize: 13,
    color: '#16a34a',
  },
  totalValueGreen: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16a34a',
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
  holdButtonStyle: {
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
  doneButton: {
    backgroundColor: '#1a1a1a',
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  payButton: {
    backgroundColor: '#10b981',
  },
  payButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
