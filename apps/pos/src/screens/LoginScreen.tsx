import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

const PIN_LENGTH = 6;

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [pin, setPin] = useState('');

  const handleDigit = useCallback((digit: string) => {
    setPin((prev) => (prev.length < PIN_LENGTH ? prev + digit : prev));
  }, []);

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleConfirm = useCallback(() => {
    if (pin.length === PIN_LENGTH) {
      // TODO: validate PIN against staff record
      navigation.replace('Main');
    }
  }, [pin, navigation]);

  const renderDots = () =>
    Array.from({ length: PIN_LENGTH }, (_, i) => (
      <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
    ));

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter PIN</Text>

      <View style={styles.dotsRow}>{renderDots()}</View>

      <View style={styles.grid}>
        {digits.map((d, i) => {
          if (d === '') {
            return <View key={i} style={styles.key} />;
          }

          const onPress = d === '⌫' ? handleBackspace : () => handleDigit(d);

          return (
            <TouchableOpacity key={i} style={styles.key} onPress={onPress}>
              <Text style={styles.keyText}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.confirm, pin.length < PIN_LENGTH && styles.confirmDisabled]}
        onPress={handleConfirm}
        disabled={pin.length < PIN_LENGTH}
      >
        <Text style={styles.confirmText}>Confirm</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    marginBottom: 32,
    color: '#1a1a1a',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 40,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#999',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#1a1a1a',
    borderColor: '#1a1a1a',
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
  keyText: {
    fontSize: 28,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  confirm: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  confirmDisabled: {
    opacity: 0.3,
  },
  confirmText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
