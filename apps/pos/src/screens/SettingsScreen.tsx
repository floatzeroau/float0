import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useShift } from '../state/ShiftProvider';

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { currentShift, staffId } = useShift();

  const canCloseShift = currentShift && staffId && currentShift.staffId === staffId;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Terminal Settings</Text>

      {canCloseShift && (
        <TouchableOpacity
          style={styles.closeShiftButton}
          onPress={() => navigation.navigate('CloseShift')}
        >
          <Text style={styles.closeShiftText}>Close Shift</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 24, fontWeight: '600', color: '#1a1a1a' },
  closeShiftButton: {
    marginTop: 32,
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
});
