import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { database } from '../db/database';
import type { ProductModifierGroup, ModifierGroup, Modifier } from '../db/models';
import { calculateLineTotal } from '@float0/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelectedModifier {
  id: string;
  name: string;
  priceAdjustment: number;
}

export interface ModifierModalResult {
  productId: string;
  productName: string;
  basePrice: number;
  selectedModifiers: SelectedModifier[];
  quantity: number;
  lineTotal: number;
}

interface ModifierGroupData {
  id: string;
  name: string;
  displayName: string | null;
  minSelections: number;
  maxSelections: number;
  sortOrder: number;
  modifiers: ModifierData[];
}

interface ModifierData {
  id: string;
  name: string;
  priceAdjustment: number;
  isDefault: boolean;
  isAvailable: boolean;
  sortOrder: number;
}

interface ModifierModalProps {
  visible: boolean;
  productId: string | null;
  productName: string;
  basePrice: number;
  onCancel: () => void;
  onAdd: (result: ModifierModalResult) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ModifierModal({
  visible,
  productId,
  productName,
  basePrice,
  onCancel,
  onAdd,
}: ModifierModalProps) {
  const [groups, setGroups] = useState<ModifierGroupData[]>([]);
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});

  // Load modifier groups and modifiers when product changes
  useEffect(() => {
    if (!productId || !visible) return;

    (async () => {
      try {
        const pmgRows = await database
          .get<ProductModifierGroup>('product_modifier_groups')
          .query()
          .fetch();

        const productPmgs = pmgRows
          .filter((pmg) => pmg.productId === productId)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        const loaded: ModifierGroupData[] = [];
        for (const pmg of productPmgs) {
          try {
            const mg = await database
              .get<ModifierGroup>('modifier_groups')
              .find(pmg.modifierGroupId);

            const modRows = await database.get<Modifier>('modifiers').query().fetch();

            const groupModifiers = modRows
              .filter((m) => m.modifierGroupId === mg.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);

            loaded.push({
              id: mg.id,
              name: mg.name,
              displayName: mg.displayName ?? null,
              minSelections: mg.minSelections,
              maxSelections: mg.maxSelections,
              sortOrder: pmg.sortOrder,
              modifiers: groupModifiers.map((m) => ({
                id: m.id,
                name: m.name,
                priceAdjustment: m.priceAdjustment,
                isDefault: m.isDefault,
                isAvailable: m.isAvailable,
                sortOrder: m.sortOrder,
              })),
            });
          } catch {
            console.warn(
              `[ModifierModal] Modifier group ${pmg.modifierGroupId} not found, skipping`,
            );
          }
        }

        setGroups(loaded);

        // Pre-select defaults
        const initial: Record<string, Set<string>> = {};
        for (const g of loaded) {
          const defaults = g.modifiers.filter((m) => m.isDefault && m.isAvailable).map((m) => m.id);
          initial[g.id] = new Set(defaults);
        }
        setSelections(initial);
      } catch (e) {
        console.warn('[ModifierModal] Failed to load modifiers:', e);
      }
    })();
  }, [productId, visible]);

  // Toggle modifier selection
  const toggleModifier = useCallback(
    (groupId: string, modifierId: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;

      setSelections((prev) => {
        const current = new Set(prev[groupId] ?? []);
        const isSingleSelect = group.maxSelections === 1;

        if (isSingleSelect) {
          // Radio behaviour
          if (current.has(modifierId) && group.minSelections === 0) {
            // Allow deselect if group is optional
            current.delete(modifierId);
          } else {
            current.clear();
            current.add(modifierId);
          }
        } else {
          // Checkbox behaviour
          if (current.has(modifierId)) {
            current.delete(modifierId);
          } else if (current.size < group.maxSelections) {
            current.add(modifierId);
          }
        }

        return { ...prev, [groupId]: current };
      });
    },
    [groups],
  );

  // Get all selected modifiers flat
  const selectedModifiers = useMemo((): SelectedModifier[] => {
    const result: SelectedModifier[] = [];
    for (const g of groups) {
      const sel = selections[g.id];
      if (!sel) continue;
      for (const m of g.modifiers) {
        if (sel.has(m.id)) {
          result.push({ id: m.id, name: m.name, priceAdjustment: m.priceAdjustment });
        }
      }
    }
    return result;
  }, [groups, selections]);

  // Calculate live price
  const lineTotal = useMemo(
    () =>
      calculateLineTotal(
        basePrice,
        selectedModifiers.map((m) => m.priceAdjustment),
        1,
      ),
    [basePrice, selectedModifiers],
  );

  // Check if all required groups are satisfied
  const isValid = useMemo(() => {
    for (const g of groups) {
      if (g.minSelections > 0) {
        const count = selections[g.id]?.size ?? 0;
        if (count < g.minSelections) return false;
      }
    }
    return true;
  }, [groups, selections]);

  const handleAdd = useCallback(() => {
    if (!productId || !isValid) return;
    onAdd({
      productId,
      productName,
      basePrice,
      selectedModifiers,
      quantity: 1,
      lineTotal,
    });
  }, [productId, productName, basePrice, selectedModifiers, lineTotal, isValid, onAdd]);

  // Selection rule hint text
  const getHint = (g: ModifierGroupData): string => {
    if (g.minSelections === 0 && g.maxSelections === 1) return 'Optional, pick one';
    if (g.minSelections === 1 && g.maxSelections === 1) return 'Required, pick one';
    if (g.minSelections === 0) return `Optional, up to ${g.maxSelections}`;
    if (g.minSelections === g.maxSelections) return `Pick exactly ${g.minSelections}`;
    return `Pick ${g.minSelections}–${g.maxSelections}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      supportedOrientations={['landscape-left', 'landscape-right']}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {productName}
            </Text>
            <Text style={styles.headerPrice}>${basePrice.toFixed(2)}</Text>
          </View>

          {/* Groups */}
          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {groups.map((g) => {
              const isSingleSelect = g.maxSelections === 1;
              const isRequired = g.minSelections > 0;
              const sel = selections[g.id] ?? new Set();
              const satisfied = sel.size >= g.minSelections;

              return (
                <View key={g.id} style={styles.groupSection}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupName}>{g.displayName ?? g.name}</Text>
                    <Text
                      style={[
                        styles.groupHint,
                        isRequired && !satisfied && styles.groupHintRequired,
                      ]}
                    >
                      {getHint(g)}
                    </Text>
                  </View>

                  {g.modifiers.map((m) => {
                    const selected = sel.has(m.id);
                    const disabled = !m.isAvailable;

                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.modifierRow, disabled && styles.modifierRowDisabled]}
                        onPress={() => toggleModifier(g.id, m.id)}
                        disabled={disabled}
                        activeOpacity={0.6}
                      >
                        {/* Radio / Checkbox indicator */}
                        <View
                          style={[
                            isSingleSelect ? styles.radio : styles.checkbox,
                            selected && styles.indicatorSelected,
                            disabled && styles.indicatorDisabled,
                          ]}
                        >
                          {selected && <View style={styles.indicatorInner} />}
                        </View>

                        <Text
                          style={[styles.modifierName, disabled && styles.modifierNameDisabled]}
                        >
                          {m.name}
                        </Text>

                        {m.priceAdjustment !== 0 && (
                          <Text style={styles.modifierPrice}>
                            {m.priceAdjustment > 0 ? '+' : ''}${m.priceAdjustment.toFixed(2)}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addButton, !isValid && styles.addButtonDisabled]}
              onPress={handleAdd}
              disabled={!isValid}
            >
              <Text style={styles.addText}>Add to Order — ${lineTotal.toFixed(2)}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 12,
  },
  headerPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },

  // Body
  body: {
    paddingHorizontal: 20,
  },

  // Group section
  groupSection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  groupHint: {
    fontSize: 12,
    color: '#999',
  },
  groupHintRequired: {
    color: '#dc2626',
    fontWeight: '600',
  },

  // Modifier row
  modifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  modifierRowDisabled: {
    opacity: 0.4,
  },
  modifierName: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    marginLeft: 12,
  },
  modifierNameDisabled: {
    color: '#999',
  },
  modifierPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
  },

  // Radio / Checkbox indicators
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicatorSelected: {
    borderColor: '#1a1a1a',
  },
  indicatorDisabled: {
    borderColor: '#e0e0e0',
  },
  indicatorInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  addButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#ccc',
  },
  addText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
