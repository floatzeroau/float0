import React from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface ProductSearchProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
}

export function ProductSearch({ value, onChangeText, onClear }: ProductSearchProps) {
  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Search products..."
        placeholderTextColor="#999"
        value={value}
        onChangeText={onChangeText}
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity style={styles.clearButton} onPress={onClear}>
          <Text style={styles.clearText}>X</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  input: {
    flex: 1,
    height: 36,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1a1a1a',
  },
  clearButton: {
    marginLeft: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
});
