import * as Haptics from "expo-haptics";
import { Link } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, FadeInRight, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { colors } from "@/theme/tokens";

const OTP_LENGTH = 6;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Mode = "password" | "code";

/** Vendor sign-in with the same Supabase Auth account they use on the web app. */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithPassword, sendEmailOtp, verifyEmailOtp, demo, isPreview } = useAuth();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secretRef = useRef<TextInput>(null);
  const shake = useSharedValue(0);

  const emailOk = EMAIL.test(email.trim());
  const awaitingCode = mode === "code" && !codeSent;
  const canSubmit = emailOk && !busy && (awaitingCode || (mode === "code" ? secret.length === OTP_LENGTH : secret.length > 0));

  const fail = (e: unknown) => {
    setError(friendlyError(e));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    shake.value = withSequence(withTiming(-10, { duration: 50 }), withTiming(10, { duration: 50 }), withTiming(-6, { duration: 50 }), withTiming(0, { duration: 50 }));
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (awaitingCode) {
        await sendEmailOtp(email);
        setCodeSent(true);
        setSecret("");
        setTimeout(() => secretRef.current?.focus(), 250);
      } else if (mode === "code") {
        await verifyEmailOtp(email, secret);
      } else {
        await signInWithPassword(email, secret);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: Mode) => {
    Haptics.selectionAsync();
    setMode(m);
    setSecret("");
    setCodeSent(false);
    setError(null);
  };

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <KeyboardAvoidingView className="flex-1 bg-obsidian" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <LinearGradient colors={["#16162A", colors.obsidian]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 360 }} />
      <View className="flex-1 px-6" style={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }}>
        <Animated.View entering={FadeInDown.duration(500)}>
          <View className="h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface">
            <Text className="text-xl font-extrabold text-gold">₹</Text>
          </View>
          <Text className="mt-8 font-mono text-[11px] uppercase tracking-label text-faint">RecoveryAI · Business</Text>
          <Text className="mt-2 text-[32px] font-extrabold leading-10 text-ink">{"Every rupee you're owed,\nin one vault."}</Text>
          <Text className="mt-3 text-[15px] leading-6 text-mute">Sign in with your RecoveryAI web account.</Text>
        </Animated.View>

        <View className="mt-8 flex-row gap-2">
          {(["password", "code"] as const).map((m) => (
            <Pressable
              key={m}
              onPress={() => switchMode(m)}
              accessibilityRole="radio"
              accessibilityState={{ selected: mode === m }}
              className={`flex-1 items-center rounded-full border py-3 ${mode === m ? "border-gold/60 bg-gold/10" : "border-line bg-surface"}`}
            >
              <Text className={`text-[14px] font-semibold ${mode === m ? "text-gold" : "text-mute"}`}>{m === "password" ? "Password" : "Email code"}</Text>
            </Pressable>
          ))}
        </View>

        <Animated.View key={mode} entering={FadeInRight.duration(300)} style={[{ marginTop: 16 }, shakeStyle]}>
          <Field>
            <TextInput
              value={email}
              onChangeText={(t) => {
                setError(null);
                setEmail(t);
              }}
              placeholder="you@business.in"
              placeholderTextColor={colors.faint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="username"
              editable={!codeSent}
              returnKeyType="next"
              onSubmitEditing={() => (awaitingCode ? submit() : secretRef.current?.focus())}
              accessibilityLabel="Email"
              style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: "600" }}
            />
            {emailOk && <Text className="text-emerald">✓</Text>}
          </Field>

          {!awaitingCode && (
            <Field className="mt-3">
              <TextInput
                ref={secretRef}
                value={secret}
                onChangeText={(t) => {
                  setError(null);
                  setSecret(mode === "code" ? t.replace(/\D/g, "").slice(0, OTP_LENGTH) : t);
                }}
                placeholder={mode === "code" ? `${OTP_LENGTH}-digit code from your email` : "Password"}
                placeholderTextColor={colors.faint}
                secureTextEntry={mode === "password"}
                keyboardType={mode === "code" ? "number-pad" : "default"}
                textContentType={mode === "code" ? "oneTimeCode" : "password"}
                autoComplete={mode === "code" ? "one-time-code" : "current-password"}
                returnKeyType="go"
                onSubmitEditing={submit}
                accessibilityLabel={mode === "code" ? "Email code" : "Password"}
                style={{ flex: 1, color: colors.ink, fontSize: 17, fontWeight: "600", letterSpacing: mode === "code" ? 6 : 0 }}
              />
            </Field>
          )}
          {codeSent && (
            <Pressable onPress={() => setCodeSent(false)} className="mt-3 self-start" accessibilityRole="button">
              <Text className="text-sm font-semibold text-mute">Use a different email</Text>
            </Pressable>
          )}
        </Animated.View>

        {error && <Text className="mt-4 text-sm text-crimson">{error}</Text>}

        <Link href="/signup" asChild>
          <Pressable className="mt-5 self-start" accessibilityRole="link">
            <Text className="text-sm text-mute">
              New to RecoveryAI? <Text className="font-bold text-gold">Create an account</Text>
            </Text>
          </Pressable>
        </Link>

        <View className="flex-1" />

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          className="h-14 items-center justify-center rounded-full bg-gold active:opacity-80"
          style={{ opacity: canSubmit ? 1 : 0.4 }}
        >
          {busy ? (
            <ActivityIndicator color={colors.obsidian} />
          ) : (
            <Text className="text-base font-extrabold text-obsidian">{awaitingCode ? "Email me a code" : "Unlock vault"}</Text>
          )}
        </Pressable>
        <Text className="mt-4 text-center text-[11px] leading-4 text-faint">
          Your session is stored in the device keychain.{"\n"}Face ID / fingerprint is required every time the app opens.
        </Text>
        {(demo || isPreview) && (
          <Text className="mt-2 text-center font-mono text-[10px] text-gold">
            {demo ? `TEST BUILD · ${demo.email} · CODE ${demo.code}` : "PREVIEW · SUPABASE NOT CONFIGURED"}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <View className={`h-16 flex-row items-center rounded-2xl border border-line bg-surface px-4 ${className}`}>{children}</View>;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/rate|too many|security purposes/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  if (/invalid login credentials/i.test(msg)) return "Email or password is wrong.";
  if (/signups not allowed|user not found/i.test(msg)) return "No RecoveryAI account uses this email.";
  if (/expired|invalid|token/i.test(msg)) return "That code didn't work. Check it or request a new one.";
  if (/network|fetch/i.test(msg)) return "No connection. Check your internet and try again.";
  return msg;
}
