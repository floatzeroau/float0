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
import { Lock } from 'lucide-react-native';
import { useOrder } from '../state/order-store';
import type { CartItemData } from '../state/order-store';
import { CustomerSearchModal } from './CustomerSearchModal';
import type { CustomerResult } from './CustomerSearchModal';
import { HeldOrdersDrawer } from './HeldOrdersDrawer';
import { DiscountModal } from './DiscountModal';
import { VoidItemModal } from './VoidItemModal';
import { PriceOverrideModal } from './PriceOverrideModal';
import { ConvertToPackModal } from './ConvertToPackModal';
import type { OrgCafePackSettings } from './ConvertToPackModal';
import { ServeFromPackModal } from './ServeFromPackModal';
import { API_URL, AUTH_TOKEN_KEY } from '../config';
import type { DiscountType } from '@float0/shared';
import { colors, radii, typography } from '../theme/tokens';

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
              <Lock size={12} color={colors.pack} />
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
            placeholderTextColor={colors.textMuted}
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
  const [showServePack, setShowServePack] = useState(false);

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
                {currentOrder.customerId && (
                  <View style={styles.packButtonRow}>
                    <TouchableOpacity
                      style={styles.servePackButton}
                      onPress={() => {
                        setShowMenu(false);
                        setShowServePack(true);
                      }}
                    >
                      <Text style={styles.servePackText}>Serve from Pack</Text>
                    </TouchableOpacity>
                  </View>
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
        <ServeFromPackModal
          visible={showServePack}
          customerId={currentOrder.customerId}
          customerName={currentOrder.customerName ?? ''}
          onComplete={() => setShowServePack(false)}
          onCancel={() => setShowServePack(false)}
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

  // Header
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    gap: 4,
  },
  heldButtonText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  heldBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  heldBadgeText: {
    fontSize: typography.size.xxs,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  submittedBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.lg,
  },
  submittedBadgeText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  menuButton: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textSecondary,
    marginTop: -4,
  },
  menuDropdown: {
    marginTop: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuItemText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  menuItemTextDanger: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.danger,
  },
  headerOrder: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  orderTypeBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.lg,
  },
  orderTypeBadgeText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },

  // Customer
  customerRow: {
    marginTop: 8,
  },
  addCustomerButton: {
    paddingVertical: 4,
  },
  addCustomerText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: '#888',
  },
  customerAssigned: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  customerName: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: '#1a6ed8',
    maxWidth: 160,
  },
  customerRemove: {
    marginLeft: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customerRemoveText: {
    fontSize: typography.size.xxs,
    fontWeight: typography.weight.bold,
    color: '#1a6ed8',
  },
  packButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  servePackButton: {
    alignSelf: 'flex-start',
  },
  servePackText: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.pack,
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
    fontSize: typography.size.base,
    color: colors.textMuted,
  },

  // Item row
  itemRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  itemRowVoided: {
    backgroundColor: colors.dangerLight,
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
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  itemNameVoided: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  textStrikethrough: {
    textDecorationLine: 'line-through',
  },
  itemModifiers: {
    fontSize: typography.size.sm,
    color: '#888',
    marginTop: 2,
  },
  itemDiscountReason: {
    fontSize: typography.size.sm,
    fontStyle: 'italic',
    color: colors.successDark,
    marginTop: 2,
  },
  itemNotes: {
    fontSize: typography.size.sm,
    fontStyle: 'italic',
    color: '#888',
    marginTop: 2,
  },
  itemPriceCol: {
    alignItems: 'flex-end',
  },
  itemTotal: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
  },
  itemTotalVoided: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  itemTotalStrikethrough: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  itemTotalDiscounted: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.successDark,
  },

  // Void styles
  voidBadge: {
    backgroundColor: colors.danger,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  voidBadgeText: {
    fontSize: typography.size.xxs,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
  voidReasonText: {
    fontSize: typography.size.sm,
    fontStyle: 'italic',
    color: colors.danger,
    marginTop: 2,
  },
  // Override styles
  overrideBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  overrideBadgeText: {
    fontSize: typography.size.xxs,
    fontWeight: typography.weight.bold,
    color: colors.primary,
  },
  overrideReasonText: {
    fontSize: typography.size.sm,
    fontStyle: 'italic',
    color: colors.primary,
    marginTop: 2,
  },
  itemTotalOverride: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },
  submittedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  priceOverrideButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: '#eff6ff',
  },
  priceOverrideButtonText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.primary,
  },

  voidItemButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.dangerLight,
  },
  voidItemButtonText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.danger,
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
    borderRadius: radii.sm,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  qtyText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textPrimary,
    minWidth: 20,
    textAlign: 'center',
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: typography.size.sm,
    color: '#888',
  },
  actionTextGreen: {
    color: colors.successDark,
  },
  actionTextBlue: {
    color: colors.primary,
  },
  actionDivider: {
    fontSize: typography.size.sm,
    color: '#ddd',
  },
  actionRemove: {
    color: colors.danger,
  },
  actionTextPack: {
    color: colors.pack,
    fontWeight: typography.weight.semibold,
  },

  // Pack item styles
  itemRowPack: {
    backgroundColor: colors.packLight,
    borderLeftWidth: 3,
    borderLeftColor: colors.pack,
  },
  packNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  packLockIcon: {
    fontSize: typography.size.sm,
  },
  packBadge: {
    backgroundColor: colors.pack,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.xs,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  packBadgeText: {
    fontSize: typography.size.xxs,
    fontWeight: typography.weight.bold,
    color: colors.white,
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
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  noteSaveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.textPrimary,
    borderRadius: radii.sm,
  },
  noteSaveText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.white,
  },

  // Totals
  totalsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
  },
  totalLabelGreen: {
    fontSize: typography.size.md,
    color: colors.successDark,
  },
  totalValueGreen: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.successDark,
  },
  grandTotalRow: {
    marginTop: 4,
    marginBottom: 0,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  grandTotalLabel: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },
  grandTotalValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.textPrimary,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdButtonStyle: {
    backgroundColor: colors.background,
  },
  holdButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  submitButton: {
    backgroundColor: colors.textPrimary,
  },
  disabledButton: {
    backgroundColor: colors.textDisabled,
  },
  submitButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.white,
  },
  disabledSubmitText: {
    color: colors.white,
  },
  disabledText: {
    color: colors.textDisabled,
  },
  doneButton: {
    backgroundColor: colors.textPrimary,
  },
  doneButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: colors.white,
  },
  payButton: {
    flex: 2,
    backgroundColor: colors.success,
    paddingVertical: 14,
  },
  payButtonText: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.white,
  },
});
