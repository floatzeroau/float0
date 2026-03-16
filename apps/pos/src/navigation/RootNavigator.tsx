import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import LoginScreen from '../screens/LoginScreen';
import POSScreen from '../screens/POSScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { SyncProvider } from '../sync/SyncProvider';

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

export type RootStackParamList = {
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
      <Tab.Navigator screenOptions={{ headerShown: false }}>
        <Tab.Screen name="POS" component={POSScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </SyncProvider>
  );
}

// ---------------------------------------------------------------------------
// Root stack
// ---------------------------------------------------------------------------

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Main" component={MainTabs} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
