import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { biometricLabel } from "@/lib/biometric";
import { colors } from "@/theme/tokens";

/** Biometric gate for returning sessions, and the one-time "turn on quick unlock?" offer. */
export default function UnlockScreen() {
  const insets = useSafeAreaInsets();
  const { status, biometricKind, unlock, answerBiometricOffer, signOut } = useAuth();
  const [failed, setFailed] = useState(false);
  const label = biometricLabel(biometricKind);
  const offering = status === "offerBiometric";

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const tryUnlock = async () => {
    setFailed(false);
    const ok = await unlock();
    if (!ok) {
      setFailed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  // Prompt straight away when locked; the button is there for retries.
  useEffect(() => {
    if (status === "locked") tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <View className="flex-1 bg-obsidian">
      <BlurView intensity={30} tint="dark" style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center px-8" style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}>
          <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: "center" }}>
            <Animated.View
              style={[
                {
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(0,229,153,0.4)",
                  backgroundColor: "rgba(0,229,153,0.1)",
                },
                ring,
              ]}
            >
              <Text className="text-4xl text-emerald">{biometricKind === "fingerprint" ? "◉" : "◎"}</Text>
            </Animated.View>
            <Text className="mt-8 font-mono text-[11px] uppercase tracking-label text-faint">RecoveryAI · Pay</Text>
            <Text className="mt-2 text-center text-2xl font-extrabold text-ink">
              {offering ? `Use ${label} next time?` : "Vault locked"}
            </Text>
            <Text className="mt-3 text-center text-[15px] leading-6 text-mute">
              {offering
                ? `Open the app with ${label} instead of a new code each time. Your amounts stay hidden from anyone else holding your phone.`
                : `Use ${label} to view your account.`}
            </Text>
            {failed && <Text className="mt-3 text-sm text-crimson">Didn't match. Try again.</Text>}
          </Animated.View>
        </View>

        <View className="px-6" style={{ paddingBottom: insets.bottom + 24 }}>
          <Pressable
            onPress={offering ? () => answerBiometricOffer(true) : tryUnlock}
            accessibilityRole="button"
            className="h-14 items-center justify-center rounded-full bg-emerald active:opacity-80"
          >
            <Text className="text-base font-extrabold text-obsidian">{offering ? `Turn on ${label}` : `Unlock with ${label}`}</Text>
          </Pressable>
          <Pressable
            onPress={offering ? () => answerBiometricOffer(false) : signOut}
            accessibilityRole="button"
            className="mt-3 h-12 items-center justify-center"
          >
            <Text className="text-sm font-semibold text-mute">{offering ? "Not now" : "Sign in with a code instead"}</Text>
          </Pressable>
        </View>
      </BlurView>
    </View>
  );
}
