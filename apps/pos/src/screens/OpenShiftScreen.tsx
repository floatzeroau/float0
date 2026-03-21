import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { database } from '../db/database';
import type { Shift } from '../db/models';
import { STAFF_ID_KEY, STAFF_NAME_KEY } from '../config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setRaw(record: any, field: string, value: string | number) {
  (record._raw as any)[field] = value;
}

const AUD_DENOMINATIONS = [
  { label: '$100', cents: 10000 },
  { label: '$50', cents: 5000 },
  { label: '$20', cents: 2000 },
  { label: '$10', cents: 1000 },
  { label: '$5', cents: 500 },
  { label: '$2', cents: 200 },
  { label: '$1', cents: 100 },
  { label: '50c', cents: 50 },
  { label: '20c', cents: 20 },
  { label: '10c', cents: 10 },
  { label: '5c', cents: 5 },
];

type Props = NativeStackScreenProps<RootStackParamList, 'OpenShift'>;

export default function OpenShiftScreen({ navigation }: Props) {
  const [amountCents, setAmountCents] = useState(0);
  const [denomExpanded, setDenomExpanded] = useState(false);
  const [denomCounts, setDenomCounts] = useState<number[]>(() =>
    new Array(AUD_DENOMINATIONS.length).fill(0),
  );
  const [staffName, setStaffName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    SecureStore.getItemAsync(STAFF_NAME_KEY).then(setStaffName);
  }, []);

  const displayAmount = `$${(amountCents / 100).toFixed(2)}`;

  const handleDigit = (d: string) => {
    if (denomExpanded) return;
    const next = amountCents * 10 + parseInt(d, 10);
    if (next <= 9999999) setAmountCents(next);
  };

  const handleBackspace = () => {
    if (denomExpanded) return;
    setAmountCents(Math.floor(amountCents / 10));
  };

  const handleClear = () => {
    if (denomExpanded) return;
    setAmountCents(0);
  };

  const updateDenomCount = (index: number, delta: number) => {
    setDenomCounts((prev) => {
      const next = [...prev];
      next[index] = Math.max(0, next[index] + delta);
      const total = next.reduce((sum, count, i) => sum + count * AUD_DENOMINATIONS[i].cents, 0);
      setAmountCents(total);
      return next;
    });
  };

  const denomTotal = denomCounts.reduce(
    (sum, count, i) => sum + count * AUD_DENOMINATIONS[i].cents,
    0,
  );

  const handleOpenShift = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const staffId = await SecureStore.getItemAsync(STAFF_ID_KEY);
      if (!staffId) return;
      const now = Date.now();
      await database.write(async () => {
        await database.get<Shift>('shifts').create((s) => {
          setRaw(s, 'server_id', '');
          setRaw(s, 'staff_id', staffId);
          setRaw(s, 'terminal_id', 'terminal-1');
          setRaw(s, 'opened_at', now);
          setRaw(s, 'opening_float', amountCents / 100);
          setRaw(s, 'status', 'open');
          setRaw(s, 'created_at', now);
          setRaw(s, 'updated_at', now);
        });
      });
      navigation.replace('Main');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDenom = () => {
    if (denomExpanded) {
      // Collapsing — reset denomination counts
      setDenomCounts(new Array(AUD_DENOMINATIONS.length).fill(0));
    }
    setDenomExpanded(!denomExpanded);
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '\u232B'];

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scroll}>
      <Text style={styles.title}>Open Shift</Text>
      {staffName ? <Text style={styles.welcome}>Welcome, {staffName}</Text> : null}

      <Text style={styles.amount}>{displayAmount}</Text>

      <View style={styles.grid}>
        {digits.map((d, i) => {
          const onPress =
            d === '\u232B' ? handleBackspace : d === 'C' ? handleClear : () => handleDigit(d);
          const disabled = denomExpanded && d !== 'C';

          return (
            <TouchableOpacity
              key={i}
              style={[styles.key, disabled && styles.keyDisabled]}
              onPress={onPress}
              disabled={disabled}
            >
              <Text style={styles.keyText}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.denomToggle} onPress={toggleDenom}>
        <Text style={styles.denomToggleText}>
          {denomExpanded ? '▼' : '▶'} Count by denomination
        </Text>
      </TouchableOpacity>

      {denomExpanded && (
        <View style={styles.denomSection}>
          {AUD_DENOMINATIONS.map((denom, index) => (
            <View key={denom.label} style={styles.denomRow}>
              <Text style={styles.denomLabel}>{denom.label}</Text>
              <TouchableOpacity style={styles.denomBtn} onPress={() => updateDenomCount(index, -1)}>
                <Text style={styles.denomBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.denomCount}>{denomCounts[index]}</Text>
              <TouchableOpacity style={styles.denomBtn} onPress={() => updateDenomCount(index, 1)}>
                <Text style={styles.denomBtnText}>+</Text>
              </TouchableOpacity>
              <Text style={styles.denomLineTotal}>
                ${((denomCounts[index] * denom.cents) / 100).toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={styles.denomTotalRow}>
            <Text style={styles.denomTotalLabel}>Total:</Text>
            <Text style={styles.denomTotalValue}>${(denomTotal / 100).toFixed(2)}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.openButton, submitting && styles.openButtonDisabled]}
        onPress={handleOpenShift}
        disabled={submitting}
      >
        <Text style={styles.openButtonText}>Open Shift</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  welcome: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
  },
  amount: {
    fontSize: 48,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 270,
    justifyContent: 'center',
  },
  key: {
    width: 80,
    height: 80,
    margin: 5,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyDisabled: {
    opacity: 0.3,
  },
  keyText: {
    fontSize: 28,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  denomToggle: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  denomToggleText: {
    fontSize: 16,
    color: '#4b5563',
    fontWeight: '500',
  },
  denomSection: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  denomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  denomLabel: {
    width: 60,
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  denomBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  denomBtnText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  denomCount: {
    width: 40,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  denomLineTotal: {
    flex: 1,
    textAlign: 'right',
    fontSize: 16,
    color: '#6b7280',
  },
  denomTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    marginTop: 8,
    paddingTop: 12,
  },
  denomTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  denomTotalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  openButton: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  openButtonDisabled: {
    opacity: 0.3,
  },
  openButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
