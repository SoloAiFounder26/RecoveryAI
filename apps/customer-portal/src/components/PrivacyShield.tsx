import { BlurView } from "expo-blur";
import * as ScreenCapture from "expo-screen-capture";
import { useEffect, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";

/**
 * Hides balances whenever the app leaves the foreground (app switcher, incoming
 * call, notification shade) and blocks screenshots / screen recording.
 */
export function PrivacyShield() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    ScreenCapture.preventScreenCaptureAsync("portal").catch(() => {});
    // iOS snapshots the app for the switcher before JS can re-render; this blurs that snapshot natively.
    if (Platform.OS === "ios") ScreenCapture.enableAppSwitcherProtectionAsync(0.9).catch(() => {});
    const sub = AppState.addEventListener("change", (s) => setHidden(s !== "active"));
    return () => {
      sub.remove();
      ScreenCapture.allowScreenCaptureAsync("portal").catch(() => {});
    };
  }, []);

  if (!hidden) return null;
  return (
    <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill}>
      <View className="flex-1 items-center justify-center bg-obsidian/60">
        <Text className="font-mono text-xs uppercase tracking-label text-mute">RecoveryAI · Locked</Text>
      </View>
    </BlurView>
  );
}
