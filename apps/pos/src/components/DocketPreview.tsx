import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { KitchenDocketData } from '@float0/shared';

interface DocketPreviewProps {
  data: KitchenDocketData;
  onDismiss: () => void;
}

export function DocketPreview({ data, onDismiss }: DocketPreviewProps) {
  const slideAnim = useRef(new Animated.Value(-300)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(slideAnim, {
        toValue: -300,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        onDismiss();
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [slideAnim, onDismiss]);

  const time = new Date(data.dateTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const orderTypeLabel = data.orderType === 'dine_in' ? 'Dine-in' : 'Takeaway';

  return (
    <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
      <View style={styles.card}>
        <Text style={styles.title}>KITCHEN DOCKET</Text>
        <Text style={styles.orderNumber}>Order {data.orderNumber}</Text>
        <Text style={styles.meta}>
          {orderTypeLabel}
          {data.tableNumber ? ` T${data.tableNumber}` : ''}
          {'  '}
          {time}
        </Text>

        <View style={styles.divider} />

        {data.isModification && <Text style={styles.modificationLabel}>** MODIFICATION **</Text>}

        {data.items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <Text style={styles.itemText}>
              {item.tag ? `${item.tag} ` : ''}
              {item.quantity}x {item.name}
            </Text>
            {item.modifiers.map((mod, modIndex) => (
              <Text key={modIndex} style={styles.modifierText}>
                {'   + '}
                {mod}
              </Text>
            ))}
            {item.notes ? (
              <Text style={styles.notesText}>
                {'   !! '}
                {item.notes}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 70,
    right: 16,
    zIndex: 9999,
  },
  card: {
    backgroundColor: '#fefce8',
    borderRadius: 10,
    padding: 14,
    minWidth: 240,
    maxWidth: 300,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400e',
    textAlign: 'center',
    letterSpacing: 1,
  },
  orderNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginTop: 2,
  },
  meta: {
    fontSize: 12,
    color: '#78716c',
    textAlign: 'center',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#d6d3d1',
    marginVertical: 8,
  },
  modificationLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b45309',
    textAlign: 'center',
    marginBottom: 6,
  },
  itemRow: {
    marginBottom: 4,
  },
  itemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  modifierText: {
    fontSize: 12,
    color: '#57534e',
  },
  notesText: {
    fontSize: 12,
    color: '#b45309',
    fontStyle: 'italic',
  },
});
