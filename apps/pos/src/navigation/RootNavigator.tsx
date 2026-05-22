import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShoppingCart, ClipboardList, Users, Settings as SettingsIcon } from 'lucide-react-native';

import { colors, spacing, typography } from '../theme/tokens';
import { ToastProvider } from '../components/Toast';
import InitialSyncScreen from '../screens/InitialSyncScreen';
import LoginScreen from '../screens/LoginScreen';
import OpenShiftScreen from '../screens/OpenShiftScreen';
import CloseShiftScreen from '../screens/CloseShiftScreen';
import ShiftReportScreen from '../screens/ShiftReportScreen';
import ZReportScreen from '../screens/ZReportScreen';
import POSScreen from '../screens/POSScreen';
import OrderHistoryScreen from '../screens/OrderHistoryScreen';
import CustomersScreen from '../screens/CustomersScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { SyncProvider } from '../sync/SyncProvider';
import { SyncStatusBar } from '../components/SyncStatusBar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { OrderProvider } from '../state/order-store';
import { ShiftProvider } from '../state/ShiftProvider';

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

export type RootStackParamList = {
  Login: undefined;
  InitialSync: undefined;
  OpenShift: undefined;
  CloseShift: undefined;
  ShiftReport: { shiftId: string; reportType: 'X' | 'shift' };
  ZReport: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  POS: undefined;
  Orders: undefined;
  Customers: undefined;
  Settings: undefined;
};

// ---------------------------------------------------------------------------
// Main bottom tabs
// ---------------------------------------------------------------------------

const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  return (
    <ErrorBoundary>
      <SyncProvider>
        <OrderProvider>
          <ShiftProvider>
            <ToastProvider>
              <SafeAreaView style={styles.container} edges={['top']}>
                <SyncStatusBar />
                <Tab.Navigator
                  screenOptions={({ route }) => ({
                    headerShown: false,
                    tabBarIcon: ({ focused }) => {
                      const color = focused ? colors.tabActive : colors.tabInactive;
                      switch (route.name) {
                        case 'POS':
                          return <ShoppingCart size={24} color={color} strokeWidth={2} />;
                        case 'Orders':
                          return <ClipboardList size={24} color={color} strokeWidth={2} />;
                        case 'Customers':
                          return <Users size={24} color={color} strokeWidth={2} />;
                        case 'Settings':
                          return <SettingsIcon size={24} color={color} strokeWidth={2} />;
                        default:
                          return null;
                      }
                    },
                    tabBarActiveTintColor: colors.tabActive,
                    tabBarInactiveTintColor: colors.tabInactive,
                    tabBarActiveBackgroundColor: '#E8E8EA',
                    tabBarLabel: ({ focused, children }) => (
                      <Text
                        style={{
                          fontSize: typography.size.xs,
                          fontWeight: focused ? typography.weight.medium : '400',
                          color: focused ? colors.tabActive : colors.tabInactive,
                        }}
                      >
                        {children}
                      </Text>
                    ),
                    tabBarStyle: {
                      height: 64,
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: colors.border,
                      paddingBottom: spacing.sm,
                      paddingTop: spacing.xs,
                    },
                    tabBarItemStyle: {
                      borderRadius: 12,
                      marginHorizontal: 4,
                      paddingVertical: spacing.xs,
                    },
                  })}
                >
                  <Tab.Screen name="POS" component={POSScreen} />
                  <Tab.Screen name="Orders" component={OrderHistoryScreen} />
                  <Tab.Screen name="Customers" component={CustomersScreen} />
                  <Tab.Screen name="Settings" component={SettingsScreen} />
                </Tab.Navigator>
              </SafeAreaView>
            </ToastProvider>
          </ShiftProvider>
        </OrderProvider>
      </SyncProvider>
    </ErrorBoundary>
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
    // Always start at Login; after PIN auth, LoginScreen checks
    // whether initial sync is needed before navigating forward.
    setInitialRoute('Login');
  }, []);

  if (!initialRoute) return null;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Login">
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="InitialSync" component={InitialSyncScreen} />
      <Stack.Screen name="OpenShift" component={OpenShiftScreen} />
      <Stack.Screen name="CloseShift" component={CloseShiftScreen} />
      <Stack.Screen name="ShiftReport" component={ShiftReportScreen} />
      <Stack.Screen name="ZReport" component={ZReportScreen} />
      <Stack.Screen name="Main" component={MainTabs} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
