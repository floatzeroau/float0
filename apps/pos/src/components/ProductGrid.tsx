import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Product } from '../db/models';

interface ProductGridProps {
  categoryId: string | null;
  searchQuery: string;
  onProductSelect: (product: ProductItem) => void;
}

export interface ProductItem {
  id: string;
  name: string;
  basePrice: number;
  isAvailable: boolean;
  categoryColour: string | null;
  hasModifierGroups: boolean;
}

const NUM_COLUMNS = 4;

export function ProductGrid({ categoryId, searchQuery, onProductSelect }: ProductGridProps) {
  const [products, setProducts] = useState<ProductItem[]>([]);

  const loadProducts = useCallback(async () => {
    const clauses = [];

    if (searchQuery.length > 0) {
      clauses.push(Q.where('name', Q.like(`%${Q.sanitizeLikeString(searchQuery)}%`)));
    } else if (categoryId) {
      clauses.push(Q.where('category_id', categoryId));
    }

    clauses.push(Q.sortBy('sort_order', Q.asc));

    const rows = await database
      .get<Product>('products')
      .query(...clauses)
      .fetch();

    const items: ProductItem[] = await Promise.all(
      rows.map(async (p) => {
        let categoryColour: string | null = null;
        try {
          const cat = await p.category.fetch();
          if (cat) categoryColour = cat.colour ?? null;
        } catch {
          // category not found
        }

        let hasModifierGroups = false;
        try {
          const links = await p.productModifierGroups.fetch();
          hasModifierGroups = links.length > 0;
        } catch {
          // no links
        }

        return {
          id: p.id,
          name: p.name,
          basePrice: p.basePrice,
          isAvailable: p.isAvailable,
          categoryColour,
          hasModifierGroups,
        };
      }),
    );

    setProducts(items);
  }, [categoryId, searchQuery]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handlePress = useCallback(
    (item: ProductItem) => {
      if (!item.isAvailable) return;
      Keyboard.dismiss();
      onProductSelect(item);
    },
    [onProductSelect],
  );

  const renderItem = useCallback(
    ({ item }: { item: ProductItem }) => (
      <TouchableOpacity
        style={[styles.card, !item.isAvailable && styles.cardUnavailable]}
        onPress={() => handlePress(item)}
        activeOpacity={item.isAvailable ? 0.7 : 1}
        disabled={!item.isAvailable}
      >
        {item.categoryColour && (
          <View style={[styles.colourStripe, { backgroundColor: item.categoryColour }]} />
        )}
        <View style={styles.cardContent}>
          <Text
            style={[styles.productName, !item.isAvailable && styles.textUnavailable]}
            numberOfLines={2}
          >
            {item.name}
          </Text>
          <Text style={[styles.productPrice, !item.isAvailable && styles.textUnavailable]}>
            ${item.basePrice.toFixed(2)}
          </Text>
          {!item.isAvailable && (
            <View style={styles.unavailableBadge}>
              <Text style={styles.unavailableText}>86&apos;d</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    ),
    [handlePress],
  );

  const keyExtractor = useCallback((item: ProductItem) => item.id, []);

  return (
    <FlatList
      data={products}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={NUM_COLUMNS}
      contentContainerStyle={styles.grid}
      columnWrapperStyle={styles.row}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {searchQuery ? 'No products found' : 'No products in this category'}
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    padding: 8,
  },
  row: {
    gap: 8,
    marginBottom: 8,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    minHeight: 80,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  cardUnavailable: {
    opacity: 0.5,
  },
  colourStripe: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  textUnavailable: {
    color: '#aaa',
  },
  unavailableBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#dc2626',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  unavailableText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  emptyContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
  },
});
