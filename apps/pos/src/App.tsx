import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { DatabaseProvider } from '@nozbe/watermelondb/react';
import * as ScreenOrientation from 'expo-screen-orientation';

import { database } from './db/database';
import RootNavigator from './navigation/RootNavigator';

// Suppress WatermelonDB diagnostic messages that trigger red box in dev mode.
// These are benign sync warnings, not real errors.
LogBox.ignoreLogs([
  'Diagnostic error',
  '[Sync]',
  'Server wants client to create record',
  'Server wants client to update record',
]);

export default function App() {
  useEffect(() => {
    // Lock to landscape at runtime. Info.plist allows all orientations so
    // React Native modals don't crash, but we enforce landscape here.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  }, []);

  return (
    <DatabaseProvider database={database}>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </DatabaseProvider>
  );
}
