import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Category } from '../db/models';
import { colors, spacing, radii, typography } from '../theme/tokens';

interface CategoryTabsProps {
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

interface CategoryItem {
  id: string;
  name: string;
  colour: string | null;
}

export function CategoryTabs({ selectedCategoryId, onSelectCategory }: CategoryTabsProps) {
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  useEffect(() => {
    database
      .get<Category>('categories')
      .query(Q.sortBy('sort_order', Q.asc))
      .fetch()
      .then((rows) => {
        setCategories(
          rows.map((c) => ({
            id: c.id,
            name: c.name,
            colour: c.colour ?? null,
          })),
        );
      });
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity
          style={[styles.tab, selectedCategoryId === null && styles.tabActive]}
          onPress={() => onSelectCategory(null)}
        >
          <Text style={[styles.tabText, selectedCategoryId === null && styles.tabTextActive]}>
            All
          </Text>
        </TouchableOpacity>

        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.tab, selectedCategoryId === cat.id && styles.tabActive]}
            onPress={() => onSelectCategory(cat.id)}
          >
            {cat.colour && <View style={[styles.colourDot, { backgroundColor: cat.colour }]} />}
            <Text style={[styles.tabText, selectedCategoryId === cat.id && styles.tabTextActive]}>
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.background,
  },
  tabActive: {
    backgroundColor: colors.textPrimary,
  },
  tabText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },
  colourDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
});
