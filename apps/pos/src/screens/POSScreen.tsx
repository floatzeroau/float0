import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useOrder } from '../state/order-store';
import type { OrderType, CartItemData, CompletePaymentParams } from '../state/order-store';
import { CategoryTabs } from '../components/CategoryTabs';
import { ProductSearch } from '../components/ProductSearch';
import { ProductGrid } from '../components/ProductGrid';
import type { ProductItem } from '../components/ProductGrid';
import { ModifierModal } from '../components/ModifierModal';
import type { ModifierModalResult } from '../components/ModifierModal';
import { CartSidebar } from '../components/CartSidebar';
import { PaymentScreen } from '../components/PaymentScreen';
import { DocketPreview } from '../components/DocketPreview';
import { database } from '../db/database';
import type { Product } from '../db/models';
import { calculateLineTotal } from '@float0/shared';

// ---------------------------------------------------------------------------
// Top Bar
// ---------------------------------------------------------------------------

function TopBar() {
  const { currentOrder, createNewOrder, setOrderType, setTableNumber, isManagingSubmittedOrder } =
    useOrder();

  const handleToggle = useCallback(
    (type: OrderType) => {
      setOrderType(type);
    },
    [setOrderType],
  );

  const handleTableChange = useCallback(
    (value: string) => {
      const cleaned = value.replace(/[^0-9]/g, '');
      const num = parseInt(cleaned, 10);
      if (cleaned === '') {
        setTableNumber(null);
      } else if (num >= 1 && num <= 99) {
        setTableNumber(cleaned);
      }
    },
    [setTableNumber],
  );

  return (
    <View style={styles.topBar}>
      <View style={styles.topBarLeft}>
        <Text style={styles.orderNumber}>{currentOrder?.orderNumber ?? 'No Order'}</Text>
        {currentOrder && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{currentOrder.status.toUpperCase()}</Text>
          </View>
        )}
      </View>

      <View style={styles.topBarCenter}>
        {isManagingSubmittedOrder ? (
          <View style={styles.managingLabel}>
            <Text style={styles.managingLabelText}>Managing Submitted Order</Text>
          </View>
        ) : (
          currentOrder && (
            <>
              <View style={styles.toggleGroup}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    currentOrder.orderType === 'takeaway' && styles.toggleActive,
                  ]}
                  onPress={() => handleToggle('takeaway')}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      currentOrder.orderType === 'takeaway' && styles.toggleTextActive,
                    ]}
                  >
                    Takeaway
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    currentOrder.orderType === 'dine_in' && styles.toggleActive,
                  ]}
                  onPress={() => handleToggle('dine_in')}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      currentOrder.orderType === 'dine_in' && styles.toggleTextActive,
                    ]}
                  >
                    Dine-in
                  </Text>
                </TouchableOpacity>
              </View>

              {currentOrder.orderType === 'dine_in' && (
                <TextInput
                  style={styles.tableInput}
                  placeholder="Table #"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  maxLength={2}
                  value={currentOrder.tableNumber ?? ''}
                  onChangeText={handleTableChange}
                />
              )}
            </>
          )
        )}
      </View>

      <View style={styles.topBarRight}>
        {!isManagingSubmittedOrder && (
          <TouchableOpacity style={styles.newOrderButton} onPress={createNewOrder}>
            <Text style={styles.newOrderText}>New Order</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// POSScreen
// ---------------------------------------------------------------------------

export default function POSScreen() {
  const {
    currentOrder,
    createNewOrder,
    addItem,
    updateItemModifiers,
    addItemToSubmittedOrder,
    isManagingSubmittedOrder,
    completePayment,
    recordPartialPayment,
    cartTotals,
    lastDocket,
    clearLastDocket,
  } = useOrder();
  const [initialized, setInitialized] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [modifierProduct, setModifierProduct] = useState<ProductItem | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [paymentVisible, setPaymentVisible] = useState(false);

  useEffect(() => {
    if (!initialized && !currentOrder) {
      setInitialized(true);
      createNewOrder();
    }
  }, [initialized, currentOrder, createNewOrder]);

  const handleCategorySelect = useCallback((categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
    setSearchQuery('');
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchQuery('');
  }, []);

  const handleProductSelect = useCallback(
    async (product: ProductItem) => {
      if (product.hasModifierGroups) {
        setEditingItemId(null);
        setModifierProduct(product);
      } else {
        // Add directly to cart — fetch isGstFree from DB
        let isGstFree = false;
        try {
          const dbProduct = await database.get<Product>('products').find(product.id);
          isGstFree = dbProduct.isGstFree;
        } catch {
          // default false
        }

        const lineTotal = calculateLineTotal(product.basePrice, [], 1);
        const addFn = isManagingSubmittedOrder ? addItemToSubmittedOrder : addItem;
        await addFn({
          productId: product.id,
          productName: product.name,
          basePrice: product.basePrice,
          isGstFree,
          selectedModifiers: [],
          quantity: 1,
          lineTotal,
        });
      }
    },
    [addItem, addItemToSubmittedOrder, isManagingSubmittedOrder],
  );

  const handleModifierCancel = useCallback(() => {
    setModifierProduct(null);
    setEditingItemId(null);
  }, []);

  const handleModifierAdd = useCallback(
    async (result: ModifierModalResult) => {
      setModifierProduct(null);

      if (editingItemId) {
        // Update existing item modifiers
        await updateItemModifiers(editingItemId, result.selectedModifiers, result.lineTotal);
        setEditingItemId(null);
      } else {
        // Add new item
        let isGstFree = false;
        try {
          const dbProduct = await database.get<Product>('products').find(result.productId);
          isGstFree = dbProduct.isGstFree;
        } catch {
          // default false
        }

        const addFn = isManagingSubmittedOrder ? addItemToSubmittedOrder : addItem;
        await addFn({
          productId: result.productId,
          productName: result.productName,
          basePrice: result.basePrice,
          isGstFree,
          selectedModifiers: result.selectedModifiers,
          quantity: result.quantity,
          lineTotal: result.lineTotal,
        });
      }
    },
    [
      editingItemId,
      addItem,
      addItemToSubmittedOrder,
      isManagingSubmittedOrder,
      updateItemModifiers,
    ],
  );

  const handleEditItem = useCallback((item: CartItemData) => {
    // Re-open modifier modal for this item's product
    setEditingItemId(item.id);
    setModifierProduct({
      id: item.productId,
      name: item.productName,
      basePrice: item.unitPrice,
      hasModifierGroups: true,
    } as ProductItem);
  }, []);

  const handlePayPress = useCallback(() => {
    setPaymentVisible(true);
  }, []);

  const handlePaymentComplete = useCallback(
    async (params: CompletePaymentParams) => {
      const receiptData = await completePayment(params);
      // Modal stays open — PaymentScreen shows confirmation, then calls onCancel to close
      return receiptData;
    },
    [completePayment],
  );

  const handlePaymentCancel = useCallback(() => {
    setPaymentVisible(false);
  }, []);

  return (
    <View style={styles.container}>
      <TopBar />
      <View style={styles.content}>
        <View style={styles.productArea}>
          <ProductSearch
            value={searchQuery}
            onChangeText={handleSearchChange}
            onClear={handleSearchClear}
          />
          <CategoryTabs
            selectedCategoryId={searchQuery ? null : selectedCategoryId}
            onSelectCategory={handleCategorySelect}
          />
          <ProductGrid
            categoryId={searchQuery ? null : selectedCategoryId}
            searchQuery={searchQuery}
            onProductSelect={handleProductSelect}
          />
        </View>
        <View style={styles.cartSidebar}>
          <CartSidebar onEditItem={handleEditItem} onPay={handlePayPress} />
        </View>
      </View>

      <ModifierModal
        visible={modifierProduct !== null}
        productId={modifierProduct?.id ?? null}
        productName={modifierProduct?.name ?? ''}
        basePrice={modifierProduct?.basePrice ?? 0}
        onCancel={handleModifierCancel}
        onAdd={handleModifierAdd}
      />

      <PaymentScreen
        visible={paymentVisible}
        orderTotal={cartTotals.total}
        orderNumber={currentOrder?.orderNumber ?? ''}
        onComplete={handlePaymentComplete}
        onRecordPartialPayment={recordPartialPayment}
        onCancel={handlePaymentCancel}
      />

      {lastDocket && <DocketPreview data={lastDocket} onDismiss={clearLastDocket} />}
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

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 160,
  },
  topBarCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  topBarRight: {
    minWidth: 120,
    alignItems: 'flex-end',
  },

  // Order number
  orderNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  statusBadge: {
    marginLeft: 8,
    backgroundColor: '#e8e8e8',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },

  // Order type toggle
  toggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  toggleButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  toggleActive: {
    backgroundColor: '#1a1a1a',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
  },

  // Table number
  tableInput: {
    width: 72,
    height: 36,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#1a1a1a',
    textAlign: 'center',
  },

  // Managing label
  managingLabel: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  managingLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },

  // New Order button
  newOrderButton: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newOrderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Main content
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  productArea: {
    flex: 2,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  cartSidebar: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
