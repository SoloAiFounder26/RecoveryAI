import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackHeader } from "@/components/BackHeader";
import { Field, Label, Notice } from "@/components/Form";
import { Chip, DataGate, PrimaryButton } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { UDYAM_NUMBER_RE } from "@/lib/plans";
import { colors } from "@/theme/tokens";
import type { TenantRow } from "@/types/vendor";

// Same checks PATCH /api/tenant applies, so mistakes show before the round trip.
const UPI_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type Category = "micro" | "small" | "medium";

/** Business profile: UPI ID and NEFT details printed on reminders, and the Udyam registration statutory notices need. */
export function ProfileScreen() {
  const { snapshot, loading, error, refresh } = useVendorData();
  if (!snapshot?.tenant) return <DataGate loading={loading} error={error} onRetry={refresh} />;
  return <ProfileForm tenant={snapshot.tenant} />;
}

/** Mounted once the tenant is loaded, so the fields start from the saved values. */
function ProfileForm({ tenant: t }: { tenant: TenantRow }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role, updateProfile } = useVendorData();
  const [upi, setUpi] = useState(t.upi_id ?? "");
  const [bank, setBank] = useState(t.bank_details ?? "");
  const [udyam, setUdyam] = useState(t.udyam_number ?? "");
  const [category, setCategory] = useState<Category | null>(t.udyam_category);
  const [regOn, setRegOn] = useState(t.udyam_registered_on ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const owner = role === "owner";

  const problems = [
    upi.trim() && !UPI_RE.test(upi.trim()) ? "UPI ID looks invalid (e.g. name@bank)." : null,
    udyam.trim() && !UDYAM_NUMBER_RE.test(udyam.trim().toUpperCase()) ? "Udyam number must look like UDYAM-MH-12-0001234." : null,
    regOn.trim() && !DATE_RE.test(regOn.trim()) ? "Registration date must be YYYY-MM-DD." : null,
  ].filter(Boolean) as string[];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({
        upiId: upi.trim() || null,
        bankDetails: bank.trim() || null,
        udyamNumber: udyam.trim() ? udyam.trim().toUpperCase() : null,
        udyamCategory: category,
        udyamRegisteredOn: regOn.trim() || null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-obsidian" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}>
        <BackHeader eyebrow="Business profile" title={t.business_name} />
        {!owner && <Notice>Only the account owner can edit the business profile.</Notice>}

        <Text className="mt-6 text-[15px] font-bold text-ink">Payments</Text>
        <Text className="mt-1 text-[12px] leading-5 text-mute">Added to every reminder so debtors can pay in one tap.</Text>
        <Field label="UPI ID" value={upi} onChangeText={setUpi} placeholder="business@okicici" autoCapitalize="none" autoCorrect={false} editable={owner} />
        <Field
          label="NEFT / bank details"
          value={bank}
          onChangeText={setBank}
          placeholder="Bank · A/c number · IFSC"
          multiline
          maxLength={300}
          editable={owner}
        />

        <Text className="mt-8 text-[15px] font-bold text-ink">Udyam registration</Text>
        <Text className="mt-1 text-[12px] leading-5 text-mute">
          MSMED Act notices and interest apply only to Udyam micro and small suppliers, for invoices after registration.
        </Text>
        <Field
          label="Udyam number"
          value={udyam}
          onChangeText={setUdyam}
          placeholder="UDYAM-MH-12-0001234"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={owner}
        />
        <Label>Category</Label>
        <View className="flex-row gap-2">
          {(["micro", "small", "medium"] as const).map((c) => (
            <Chip key={c} label={c[0].toUpperCase() + c.slice(1)} active={category === c} onPress={() => owner && setCategory(category === c ? null : c)} tone={colors.gold} />
          ))}
        </View>
        <Field label="Registered on" value={regOn} onChangeText={setRegOn} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" editable={owner} />

        {problems.map((p) => (
          <Text key={p} className="mt-3 text-sm text-crimson">
            {p}
          </Text>
        ))}
        {error && <Text className="mt-3 text-sm text-crimson">{error}</Text>}
        {owner && (
          <View className="mt-6">
            <PrimaryButton label="Save profile" busy={busy} disabled={problems.length > 0} onPress={save} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
