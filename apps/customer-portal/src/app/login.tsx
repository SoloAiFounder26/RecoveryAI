import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, FadeInRight, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { formatMobile, parseIndianMobile } from "@/lib/phone";
import { colors } from "@/theme/tokens";

const OTP_LENGTH = 6;
const RESEND_AFTER_S = 30;

type Channel = "sms" | "whatsapp";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { sendOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phoneInput, setPhoneInput] = useState("");
  const [channel, setChannel] = useState<Channel>("sms");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<TextInput>(null);
  const shake = useSharedValue(0);

  const mobile = parseIndianMobile(phoneInput);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const fail = (message: string) => {
    setError(message);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    shake.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  };

  const requestCode = async () => {
    if (!mobile || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendOtp(mobile, channel);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCode("");
      setStep("code");
      setResendIn(RESEND_AFTER_S);
      setTimeout(() => codeRef.current?.focus(), 250);
    } catch (e) {
      fail(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (value: string) => {
    if (!mobile || value.length !== OTP_LENGTH || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(mobile, value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // AuthProvider moves the route on from here.
    } catch (e) {
      setCode("");
      fail(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const onCodeChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (digits.length > code.length) Haptics.selectionAsync();
    setCode(digits);
    if (digits.length === OTP_LENGTH) submitCode(digits);
  };

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <KeyboardAvoidingView className="flex-1 bg-obsidian" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <LinearGradient colors={["#16162A", colors.obsidian]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 360 }} />
      <View className="flex-1 px-6" style={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }}>
        <Animated.View entering={FadeInDown.duration(500)}>
          <View className="h-12 w-12 items-center justify-center rounded-2xl border border-line bg-surface">
            <Text className="text-xl font-extrabold text-emerald">₹</Text>
          </View>
          <Text className="mt-8 font-mono text-[11px] uppercase tracking-label text-faint">RecoveryAI · Pay</Text>
          <Text className="mt-2 text-[32px] font-extrabold leading-10 text-ink">
            {step === "phone" ? "Your dues,\nin one secure place." : "Enter the code"}
          </Text>
          <Text className="mt-3 text-[15px] leading-6 text-mute">
            {step === "phone"
              ? "Sign in with the mobile number your vendor has on file. No passwords."
              : `We sent a ${OTP_LENGTH}-digit code by ${channel === "sms" ? "SMS" : "WhatsApp"} to +91 ${formatMobile(mobile ?? "")}.`}
          </Text>
        </Animated.View>

        {step === "phone" ? (
          <Animated.View key="phone" entering={FadeInRight.duration(350)} style={[{ marginTop: 36 }, shakeStyle]}>
            <View className={`h-16 flex-row items-center rounded-2xl border bg-surface px-4 ${error ? "border-crimson/60" : "border-line"}`}>
              <Text className="mr-3 text-lg font-bold text-mute">+91</Text>
              <View className="mr-3 h-6 w-px bg-line" />
              <TextInput
                value={phoneInput}
                onChangeText={(t) => {
                  setError(null);
                  setPhoneInput(t.replace(/[^\d\s+-]/g, "").slice(0, 16));
                }}
                placeholder="98123 45678"
                placeholderTextColor={colors.faint}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={requestCode}
                accessibilityLabel="Mobile number"
                style={{ flex: 1, color: colors.ink, fontSize: 20, fontWeight: "700", letterSpacing: 1 }}
              />
              {mobile && <Text className="text-emerald">✓</Text>}
            </View>

            <Text className="mt-6 font-mono text-[11px] uppercase tracking-label text-mute">Send code via</Text>
            <View className="mt-2 flex-row gap-2">
              {(["sms", "whatsapp"] as const).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setChannel(c);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: channel === c }}
                  className={`flex-1 items-center rounded-full border py-3 ${channel === c ? "border-emerald/60 bg-emerald/10" : "border-line bg-surface"}`}
                >
                  <Text className={`text-[14px] font-semibold ${channel === c ? "text-emerald" : "text-mute"}`}>{c === "sms" ? "SMS" : "WhatsApp"}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : (
          <Animated.View key="code" entering={FadeInRight.duration(350)} style={[{ marginTop: 36 }, shakeStyle]}>
            <Pressable onPress={() => codeRef.current?.focus()} className="flex-row justify-between" accessibilityLabel="One-time code">
              {Array.from({ length: OTP_LENGTH }, (_, i) => {
                const filled = i < code.length;
                const active = i === code.length;
                return (
                  <View
                    key={i}
                    className={`h-16 w-[14.5%] items-center justify-center rounded-2xl border bg-surface ${
                      error ? "border-crimson/60" : active ? "border-emerald" : filled ? "border-ink/30" : "border-line"
                    }`}
                  >
                    <Text className="text-2xl font-extrabold text-ink">{code[i] ?? ""}</Text>
                  </View>
                );
              })}
            </Pressable>
            {/* One real input behind the boxes, so iOS/Android SMS autofill works. */}
            <TextInput
              ref={codeRef}
              value={code}
              onChangeText={onCodeChange}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
              maxLength={OTP_LENGTH}
              caretHidden
              style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            />
            <View className="mt-5 flex-row items-center justify-between">
              <Pressable onPress={() => setStep("phone")} accessibilityRole="button">
                <Text className="text-sm font-semibold text-mute">Change number</Text>
              </Pressable>
              <Pressable onPress={requestCode} disabled={resendIn > 0 || busy} accessibilityRole="button">
                <Text className={`font-mono text-xs ${resendIn > 0 ? "text-faint" : "text-emerald"}`}>
                  {resendIn > 0 ? `RESEND IN 0:${String(resendIn).padStart(2, "0")}` : "RESEND CODE"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {error && <Text className="mt-4 text-sm text-crimson">{error}</Text>}

        <View className="flex-1" />

        <Pressable
          onPress={step === "phone" ? requestCode : () => submitCode(code)}
          disabled={busy || (step === "phone" ? !mobile : code.length !== OTP_LENGTH)}
          accessibilityRole="button"
          className="h-14 items-center justify-center rounded-full bg-emerald active:opacity-80"
          style={{ opacity: busy || (step === "phone" ? !mobile : code.length !== OTP_LENGTH) ? 0.4 : 1 }}
        >
          {busy ? (
            <ActivityIndicator color={colors.obsidian} />
          ) : (
            <Text className="text-base font-extrabold text-obsidian">{step === "phone" ? "Send code" : "Verify & continue"}</Text>
          )}
        </Pressable>
        <Text className="mt-4 text-center text-[11px] leading-4 text-faint">
          You will only see invoices raised to this number.{"\n"}Your session is stored encrypted on this device.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/rate|too many|security purposes/i.test(msg)) return "Too many attempts. Please wait a minute and try again.";
  if (/expired|invalid|token/i.test(msg)) return "That code didn't work. Check it or request a new one.";
  if (/provider|sms|whatsapp|unsupported phone/i.test(msg)) return "We couldn't send a code to this number right now. Try the other option.";
  if (/network|fetch/i.test(msg)) return "No connection. Check your internet and try again.";
  return msg;
}
