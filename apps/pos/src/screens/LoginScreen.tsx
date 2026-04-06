import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { API_URL, STAFF_ID_KEY, STAFF_NAME_KEY } from '../config';

const PIN_LENGTH = 4;
const ORG_ID_KEY = 'float0_org_id';
const TOKEN_KEY = 'float0_access_token';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const lockoutTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (lockoutTimer.current) clearInterval(lockoutTimer.current);
    };
  }, []);

  const shake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const startLockout = useCallback((seconds: number) => {
    setLockoutSeconds(seconds);
    if (lockoutTimer.current) clearInterval(lockoutTimer.current);
    lockoutTimer.current = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          if (lockoutTimer.current) clearInterval(lockoutTimer.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleDigit = useCallback(
    (digit: string) => {
      if (lockoutSeconds > 0) return;
      setPin((prev) => (prev.length < PIN_LENGTH ? prev + digit : prev));
      setError('');
    },
    [lockoutSeconds],
  );

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (pin.length < PIN_LENGTH || loading || lockoutSeconds > 0) return;

    setLoading(true);
    setError('');

    try {
      // Use stored orgId or fall back to a default for development
      const orgId = (await SecureStore.getItemAsync(ORG_ID_KEY)) ?? process.env.EXPO_PUBLIC_ORG_ID;
      if (!orgId || !orgId.trim()) {
        setError('No organization configured. Set EXPO_PUBLIC_ORG_ID in .env');
        setLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/auth/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, pin }),
      });

      const body = await res.json();

      if (res.ok) {
        await SecureStore.setItemAsync(TOKEN_KEY, body.accessToken);
        await SecureStore.setItemAsync(STAFF_ID_KEY, body.staffId);
        await SecureStore.setItemAsync(STAFF_NAME_KEY, body.staffName);
        setPin('');
        const { isInitialSyncComplete } = await import('../sync/initial-sync');
        const synced = await isInitialSyncComplete();
        if (!synced) {
          navigation.replace('InitialSync');
        } else {
          const { database } = await import('../db/database');
          const { getActiveShift } = await import('../db/queries');
          const shift = await getActiveShift(database, body.staffId);
          navigation.replace(shift ? 'Main' : 'OpenShift');
        }
      } else if (res.status === 429) {
        const retryAfter = body.retryAfter ?? 300;
        startLockout(retryAfter);
        setPin('');
        shake();
        setError('Too many attempts');
      } else if (res.status === 404) {
        setPin('');
        setError('Organization not found. Check EXPO_PUBLIC_ORG_ID');
      } else {
        setPin('');
        shake();
        setError(body.error ?? 'Invalid PIN');
      }
    } catch {
      setPin('');
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [pin, loading, lockoutSeconds, navigation, shake, startLockout]);

  const renderDots = () =>
    Array.from({ length: PIN_LENGTH }, (_, i) => (
      <View
        key={i}
        style={[styles.dot, i < pin.length && styles.dotFilled, error ? styles.dotError : null]}
      />
    ));

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '\u232B'];
  const locked = lockoutSeconds > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter PIN</Text>

      <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeAnim }] }]}>
        {renderDots()}
      </Animated.View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {locked ? (
        <Text style={styles.lockoutText}>
          Try again in {Math.floor(lockoutSeconds / 60)}:
          {String(lockoutSeconds % 60).padStart(2, '0')}
        </Text>
      ) : null}

      <View style={styles.grid}>
        {digits.map((d, i) => {
          if (d === '') {
            return <View key={i} style={styles.key} />;
          }

          const onPress = d === '\u232B' ? handleBackspace : () => handleDigit(d);

          return (
            <TouchableOpacity
              key={i}
              style={[styles.key, locked && styles.keyDisabled]}
              onPress={onPress}
              disabled={locked}
            >
              <Text style={styles.keyText}>{d}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.confirm,
          (pin.length < PIN_LENGTH || loading || locked) && styles.confirmDisabled,
        ]}
        onPress={handleConfirm}
        disabled={pin.length < PIN_LENGTH || loading || locked}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.confirmText}>Confirm</Text>
        )}
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
    marginBottom: 16,
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
  dotError: {
    borderColor: '#dc2626',
    backgroundColor: '#dc2626',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    marginBottom: 8,
  },
  lockoutText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 270,
    justifyContent: 'center',
    marginTop: 16,
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
