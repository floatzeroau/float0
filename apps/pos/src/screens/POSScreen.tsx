import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useOrder } from '../state/order-store';
import type { OrderType } from '../state/order-store';
import { CategoryTabs } from '../components/CategoryTabs';
import { ProductSearch } from '../components/ProductSearch';
import { ProductGrid } from '../components/ProductGrid';
import type { ProductItem } from '../components/ProductGrid';

// ---------------------------------------------------------------------------
// Top Bar
// ---------------------------------------------------------------------------

function TopBar() {
  const { currentOrder, createNewOrder, setOrderType, setTableNumber } = useOrder();

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
        {currentOrder && (
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
        )}
      </View>

      <View style={styles.topBarRight}>
        <TouchableOpacity style={styles.newOrderButton} onPress={createNewOrder}>
          <Text style={styles.newOrderText}>New Order</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// POSScreen
// ---------------------------------------------------------------------------

export default function POSScreen() {
  const { currentOrder, createNewOrder } = useOrder();
  const [initialized, setInitialized] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleProductSelect = useCallback((product: ProductItem) => {
    // TODO: if product.hasModifierGroups → open modifier modal (FLO-49)
    // TODO: else → add directly to cart
    console.log('Product selected:', product.name, product.id);
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
          <Text style={styles.placeholderText}>Cart</Text>
          {currentOrder && currentOrder.itemCount === 0 && (
            <Text style={styles.emptyCartText}>No items yet</Text>
          )}
        </View>
      </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ccc',
  },
  emptyCartText: {
    marginTop: 8,
    fontSize: 14,
    color: '#999',
  },
});
