import "../../global.css";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { PrivacyShield } from "@/components/PrivacyShield";
import { colors } from "@/theme/tokens";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.obsidian }}>
      <SafeAreaProvider>
        <AuthProvider>
          <BottomSheetModalProvider>
            <StatusBar style="light" />
            <RootStack />
            <PrivacyShield />
          </BottomSheetModalProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootStack() {
  const { status } = useAuth();

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-obsidian">
        <ActivityIndicator color={colors.mute} />
      </View>
    );
  }

  // Each screen is reachable only in its auth state; expo-router redirects to the first allowed one.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.obsidian }, animation: "fade" }}>
      <Stack.Protected guard={status === "ready"}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={status === "locked" || status === "offerBiometric"}>
        <Stack.Screen name="unlock" />
      </Stack.Protected>
      <Stack.Protected guard={status === "signedOut"}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
