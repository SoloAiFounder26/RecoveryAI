import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackHeader } from "@/components/BackHeader";
import { Field, Notice } from "@/components/Form";
import { Pill, PrimaryButton, SectionTitle } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { formatDayMonth } from "@/lib/format";
import type { SupportRequest } from "@/lib/webApi";
import { colors } from "@/theme/tokens";

const STATUS_TONE: Record<string, string> = { open: colors.gold, in_progress: colors.emerald, resolved: colors.mute, closed: colors.mute };

/** Help & support: raise a request (Growth is flagged priority) and read replies, via /api/support. */
export function HelpScreen() {
  const insets = useSafeAreaInsets();
  const { loadSupport, sendSupport } = useVendorData();
  const [requests, setRequests] = useState<SupportRequest[] | null>(null);
  const [priority, setPriority] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSupport()
      .then((r) => {
        if (cancelled) return;
        setRequests(r.requests);
        setPriority(r.priority);
      })
      .catch((e: unknown) => !cancelled && setListError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [loadSupport]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await sendSupport(subject.trim(), message.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRequests((r) => [created, ...(r ?? [])]);
      setSubject("");
      setMessage("");
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
        <BackHeader eyebrow="Help & support" title="How can we help?" />
        {priority && <Notice tone={colors.emerald}>Priority support: your requests are flagged for faster handling.</Notice>}

        <Field label="Subject" value={subject} onChangeText={setSubject} placeholder="e.g. Reminder shows the old UPI ID" maxLength={150} />
        <Field label="Describe the problem" value={message} onChangeText={setMessage} placeholder="What happened, and what you expected" multiline maxLength={4000} />
        {error && <Text className="mt-3 text-sm text-crimson">{error}</Text>}
        <View className="mt-5">
          <PrimaryButton label="Send request" busy={busy} disabled={!subject.trim() || !message.trim()} onPress={submit} />
        </View>
        <Text className="mt-2 text-center text-[11px] text-faint">We reply here and by email. Common questions get an instant answer.</Text>

        <View className="mb-3 mt-8">
          <SectionTitle title="Your requests" />
        </View>
        {listError ? (
          <Notice tone={colors.crimson}>{listError}</Notice>
        ) : !requests ? (
          <ActivityIndicator color={colors.mute} />
        ) : requests.length === 0 ? (
          <Text className="text-[13px] text-mute">No requests yet.</Text>
        ) : (
          requests.map((r) => (
            <View key={r.id} className="mb-3 rounded-3xl border border-line bg-surface p-4">
              <View className="flex-row items-start justify-between">
                <Text className="flex-1 pr-3 text-[14px] font-bold text-ink">{r.subject}</Text>
                <Pill label={r.status.replace("_", " ")} tone={STATUS_TONE[r.status] ?? colors.mute} />
              </View>
              <Text className="mt-1 text-[12px] leading-5 text-mute">{r.message}</Text>
              <Text className="mt-1 font-mono text-[10px] text-faint">
                {formatDayMonth(new Date(r.created_at))}
                {r.priority ? " · priority" : ""}
              </Text>
              {(r.support_replies ?? []).map((rep) => (
                <View key={rep.id} className="mt-3 rounded-2xl border border-emerald/30 bg-emerald/5 p-3">
                  <Text className="font-mono text-[10px] uppercase tracking-label text-emerald">{rep.is_ai ? "RecoveryAI assistant" : "RecoveryAI support"}</Text>
                  <Text className="mt-1 text-[13px] leading-5 text-ink">{rep.message}</Text>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
