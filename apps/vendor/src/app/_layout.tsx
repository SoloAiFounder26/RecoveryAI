import "../../global.css";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { BiometricShield } from "@/components/BiometricShield";
import { VendorDataProvider } from "@/data/VendorDataProvider";
import { colors } from "@/theme/tokens";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.obsidian }}>
      <SafeAreaProvider>
        <AuthProvider>
          <BottomSheetModalProvider>
            <StatusBar style="light" />
            <ShieldedStack />
          </BottomSheetModalProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ShieldedStack() {
  const { status, signOut } = useAuth();

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-obsidian">
        <ActivityIndicator color={colors.mute} />
      </View>
    );
  }

  // Signed-in screens only render behind the biometric gate; expo-router redirects to the first allowed screen.
  return (
    <BiometricShield enabled={status === "ready"} onSignOut={signOut}>
      <VendorDataProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.obsidian }, animation: "fade" }}>
          <Stack.Protected guard={status === "ready"}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="client/[id]" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="activity" options={{ animation: "slide_from_right" }} />
            <Stack.Screen name="add-invoice" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          </Stack.Protected>
          <Stack.Protected guard={status === "signedOut"}>
            <Stack.Screen name="login" />
          </Stack.Protected>
        </Stack>
      </VendorDataProvider>
    </BiometricShield>
  );
}
