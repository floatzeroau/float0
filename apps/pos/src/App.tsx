import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { DatabaseProvider } from "@nozbe/watermelondb/react";

import { database } from "./db/database";
import RootNavigator from "./navigation/RootNavigator";

export default function App() {
  return (
    <DatabaseProvider database={database}>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </DatabaseProvider>
  );
}
