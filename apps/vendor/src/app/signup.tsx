import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { BackHeader } from "@/components/BackHeader";
import { Field } from "@/components/Form";
import { Chip, PrimaryButton } from "@/components/ui";
import { colors } from "@/theme/tokens";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** New business (or an invited accountant with a code) signs up through the web app's /api/auth/signup. */
export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signUp, isPreview } = useAuth();
  const [joining, setJoining] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    EMAIL.test(email.trim()) &&
    password.length >= 8 &&
    (joining ? inviteCode.trim().length >= 12 : businessName.trim().length > 0 && /^[6-9]\d{9}$/.test(phone));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signUp({
        email,
        password,
        businessName: joining ? "" : businessName.trim(),
        ownerPhone: joining ? "" : phone,
        inviteCode: joining ? inviteCode.trim() : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-obsidian" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }}>
        <BackHeader eyebrow="RecoveryAI · Business" title="Create your account" />
        <Text className="mt-3 text-[14px] leading-6 text-mute">Free Starter plan: 3 invoices a month. Upgrade any time.</Text>

        <View className="mt-6 flex-row gap-2">
          <Chip label="New business" active={!joining} onPress={() => setJoining(false)} tone={colors.gold} />
          <Chip label="I have an invite code" active={joining} onPress={() => setJoining(true)} tone={colors.gold} />
        </View>

        {joining ? (
          <Field
            label="Invite code"
            value={inviteCode}
            onChangeText={(t) => setInviteCode(t.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        ) : (
          <>
            <Field label="Business name" value={businessName} onChangeText={setBusinessName} placeholder="Ganesh Electronics" />
            <Field
              label="Mobile"
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(-10))}
              placeholder="98123 45678"
              keyboardType="phone-pad"
              prefix="+91"
            />
          </>
        )}
        <Field
          label={joining ? "Email the invite was sent to" : "Email"}
          value={email}
          onChangeText={setEmail}
          placeholder="you@business.in"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Field label="Password (8+ characters)" value={password} onChangeText={setPassword} placeholder="••••••••" secureTextEntry autoComplete="new-password" />

        {error && <Text className="mt-4 text-sm text-crimson">{error}</Text>}
        {isPreview && <Text className="mt-4 text-sm text-gold">Sign-up needs the live server; this preview build has none.</Text>}
        <View className="mt-6">
          <PrimaryButton label={joining ? "Join business" : "Create account"} tone={colors.gold} busy={busy} disabled={!valid || isPreview} onPress={submit} />
        </View>
        <Text onPress={() => router.back()} className="mt-5 text-center text-sm text-mute">
          Already have an account? <Text className="font-bold text-gold">Sign in</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
