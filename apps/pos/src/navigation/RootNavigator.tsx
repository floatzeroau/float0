import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';

import InitialSyncScreen from '../screens/InitialSyncScreen';
import LoginScreen from '../screens/LoginScreen';
import POSScreen from '../screens/POSScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { SyncProvider } from '../sync/SyncProvider';
import { SyncStatusBar } from '../components/SyncStatusBar';
import { OrderProvider } from '../state/order-store';
import { isInitialSyncComplete } from '../sync/initial-sync';

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

export type RootStackParamList = {
  InitialSync: undefined;
  Login: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  POS: undefined;
  Settings: undefined;
};

// ---------------------------------------------------------------------------
// Main bottom tabs
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <SyncProvider>
      <OrderProvider>
        <SafeAreaView style={styles.container} edges={['top']}>
          <SyncStatusBar />
          <Tab.Navigator screenOptions={{ headerShown: false }}>
            <Tab.Screen name="POS" component={POSScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
          </Tab.Navigator>
        </SafeAreaView>
      </OrderProvider>
    </SyncProvider>
  );
}

// ---------------------------------------------------------------------------
// Root stack
// ---------------------------------------------------------------------------

const Stack = createNativeStackNavigator<RootStackParamList>();

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default function RootNavigator() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    isInitialSyncComplete().then((complete) => {
      setInitialRoute(complete ? 'Login' : 'InitialSync');
    });
  }, []);

  // Wait until we know whether initial sync has run
  if (!initialRoute) return null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
      <Stack.Screen name="InitialSync" component={InitialSyncScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Main" component={MainTabs} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
