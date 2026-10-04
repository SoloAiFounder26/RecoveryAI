import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="customer/[id]" options={{ headerShown: true, title: 'Customer', headerTintColor: colors.text }} />
        <Stack.Screen name="conversation/[id]" options={{ headerShown: true, title: 'AI Conversation', headerTintColor: colors.text }} />
      </Stack>
    </SafeAreaProvider>
  );
}
