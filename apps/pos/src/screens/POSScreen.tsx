import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { OrderStatus } from "@float0/shared";

export default function POSScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>POS Register</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  text: { fontSize: 24, fontWeight: "600", color: "#1a1a1a" },
});
