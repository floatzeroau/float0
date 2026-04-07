import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useShift } from '../state/ShiftProvider';
import { API_URL } from '../config';
import { database } from '../db/database';
import { resetInitialSync } from '../sync/initial-sync';

const PIN_LENGTH = 4;
const ORG_ID_KEY = 'float0_org_id';

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { currentShift, staffId } = useShift();

  const canCloseShift = currentShift && staffId && currentShift.staffId === staffId;

  // Manager PIN modal state for Z Report
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const shakeAnim = useState(() => new Animated.Value(0))[0];

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

  const verifyManagerPin = useCallback(async () => {
    if (pin.length < PIN_LENGTH || pinLoading) return;

    setPinLoading(true);
    setPinError('');

    try {
      const orgId = await SecureStore.getItemAsync(ORG_ID_KEY);
      if (!orgId) {
        setPinError('No organization configured');
        setPinLoading(false);
        return;
      }

      const res = await fetch(`${API_URL}/auth/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, pin }),
      });

      if (res.ok) {
        setPinModalVisible(false);
        setPin('');
        setPinError('');
        navigation.navigate('ZReport');
      } else {
        setPin('');
        shake();
        const body = await res.json().catch(() => ({}));
        setPinError(body.error ?? 'Invalid PIN');
      }
    } catch {
      setPin('');
      setPinError('Network error');
    } finally {
      setPinLoading(false);
    }
  }, [pin, pinLoading, shake, navigation]);

  // Auto-verify when PIN is complete
  useEffect(() => {
    if (pinModalVisible && pin.length === PIN_LENGTH) {
      verifyManagerPin();
    }
  }, [pinModalVisible, pin.length, verifyManagerPin]);

  const handleDigit = (digit: string) => {
    if (pin.length < PIN_LENGTH) {
      setPin((prev) => prev + digit);
      setPinError('');
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setPinError('');
  };

  const openZReport = () => {
    setPin('');
    setPinError('');
    setPinModalVisible(true);
  };

  const [resetting, setResetting] = useState(false);

  const handleResetData = useCallback(() => {
    Alert.alert(
      'Reset All Data?',
      'This will clear the local database and re-sync from the server. You will be logged out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              await resetInitialSync(database);
              navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
            } catch (e) {
              Alert.alert('Reset failed', String(e));
            } finally {
              setResetting(false);
            }
          },
        },
      ],
    );
  }, [navigation]);

  const pinDigits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '\u232B'];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Terminal Settings</Text>

      {/* Reports Section */}
      <Text style={styles.sectionTitle}>Reports</Text>

      {currentShift && (
        <TouchableOpacity
          style={styles.reportButton}
          onPress={() =>
            navigation.navigate('ShiftReport', {
              shiftId: currentShift.id,
              reportType: 'X',
            })
          }
        >
          <Text style={styles.reportButtonTitle}>X Report</Text>
          <Text style={styles.reportButtonSubtitle}>Mid-shift snapshot</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.reportButton} onPress={openZReport}>
        <Text style={styles.reportButtonTitle}>Z Report</Text>
        <Text style={styles.reportButtonSubtitle}>End of day summary</Text>
      </TouchableOpacity>

      {/* Close Shift */}
      {canCloseShift && (
        <TouchableOpacity
          style={styles.closeShiftButton}
          onPress={() => navigation.navigate('CloseShift')}
        >
          <Text style={styles.closeShiftText}>Close Shift</Text>
        </TouchableOpacity>
      )}

      {/* Data Management */}
      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>Data Management</Text>

      <TouchableOpacity
        style={[styles.reportButton, styles.resetButton]}
        onPress={handleResetData}
        disabled={resetting}
      >
        <Text style={styles.resetButtonTitle}>
          {resetting ? 'Resetting...' : 'Reset Local Data'}
        </Text>
        <Text style={styles.reportButtonSubtitle}>Clear database and re-sync from server</Text>
      </TouchableOpacity>

      {/* Manager PIN Modal for Z Report */}
      <Modal
        visible={pinModalVisible}
        animationType="slide"
        transparent
        supportedOrientations={['landscape-left', 'landscape-right']}
      >
        <View style={styles.overlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Manager PIN Required</Text>
            <Text style={styles.modalSubtitle}>Enter manager PIN to view Z Report</Text>

            <Animated.View style={[styles.pinDots, { transform: [{ translateX: shakeAnim }] }]}>
              {Array.from({ length: PIN_LENGTH }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i < pin.length && styles.dotFilled,
                    pinError ? styles.dotError : null,
                  ]}
                />
              ))}
            </Animated.View>

            {pinError ? <Text style={styles.pinErrorText}>{pinError}</Text> : null}
            {pinLoading && <ActivityIndicator style={styles.pinLoader} color="#1a1a1a" />}

            <View style={styles.keypad}>
              {pinDigits.map((d, i) => {
                if (d === '') return <View key={i} style={styles.key} />;
                const onPress = d === '\u232B' ? handleBackspace : () => handleDigit(d);
                return (
                  <TouchableOpacity
                    key={i}
                    style={[styles.key, pinLoading && styles.keyDisabled]}
                    onPress={onPress}
                    disabled={pinLoading}
                  >
                    <Text style={styles.keyText}>{d}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setPinModalVisible(false);
                setPin('');
                setPinError('');
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
    backgroundColor: '#f8f9fa',
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 32,
  },

  // Section
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    alignSelf: 'center',
    marginBottom: 12,
  },

  // Report buttons
  reportButton: {
    width: 300,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  reportButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  reportButtonSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },

  // Reset button
  resetButton: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  resetButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
  },

  // Close shift
  closeShiftButton: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
    backgroundColor: '#dc2626',
  },
  closeShiftText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: 360,
    maxHeight: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },

  // PIN
  pinDots: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
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
  pinErrorText: {
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 8,
  },
  pinLoader: {
    marginBottom: 8,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 240,
    justifyContent: 'center',
    marginBottom: 12,
  },
  key: {
    width: 68,
    height: 52,
    margin: 4,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyDisabled: {
    opacity: 0.3,
  },
  keyText: {
    fontSize: 22,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  cancelButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    marginTop: 4,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
});
