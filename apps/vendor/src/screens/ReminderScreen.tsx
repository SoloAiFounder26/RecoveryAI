import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackHeader } from "@/components/BackHeader";
import { Label, Notice } from "@/components/Form";
import { GlassCard } from "@/components/GlassCard";
import { Chip, DataGate, EmptyState, GhostButton, PrimaryButton } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { STAGE_LABEL, stageForDaysOverdue } from "@/lib/cadence";
import { formatINR, startOfToday, toISODate } from "@/lib/format";
import { daysBetween } from "@/lib/interest";
import { canWrite, type Channel, type Tone } from "@/lib/plans";
import { toneForDaysOverdue, type Lang } from "@/lib/templates";
import type { DraftResult } from "@/lib/webApi";
import { colors } from "@/theme/tokens";

const TONES: { id: Tone; label: string }[] = [
  { id: "friendly", label: "Friendly" },
  { id: "professional", label: "Professional" },
  { id: "firm", label: "Firm / Legal" },
];

/**
 * Draft a payment reminder for one invoice: tone, WhatsApp or email, English or Hindi, with the
 * business's UPI link and NEFT details. Nothing is sent automatically: the vendor opens WhatsApp /
 * email, sends it, then marks the cadence stage as sent.
 */
export function ReminderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { customerId, invoice: startInvoice } = useLocalSearchParams<{ customerId: string; invoice?: string }>();
  const { snapshot, loading, error: loadError, refresh, getDraft, markReminderSent, plan, role } = useVendorData();

  const today = toISODate(startOfToday());
  const customer = snapshot?.customers.find((c) => c.id === customerId);
  const unpaid = (snapshot?.invoices ?? [])
    .filter((i) => i.customer_id === customerId && i.status !== "Paid")
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const [invoiceId, setInvoiceId] = useState<string | undefined>(startInvoice);
  const [toneOverride, setToneOverride] = useState<Tone | null>(null);
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [lang, setLang] = useState<Lang>("en");
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  const invoice = unpaid.find((i) => i.id === invoiceId) ?? unpaid[0];
  const daysLate = invoice ? daysBetween(invoice.due_date, today) : 0;
  const tone = toneOverride ?? toneForDaysOverdue(daysLate);
  const invId = invoice?.id;

  useEffect(() => {
    if (!invId) return;
    const mine = ++seq.current;
    setBusy(true);
    getDraft(invId, { tone, channel, lang })
      .then((d) => {
        if (mine !== seq.current) return;
        setDraft(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (mine !== seq.current) return;
        setDraft(null);
        setError(e instanceof Error ? e.message : "Could not build the draft.");
      })
      .finally(() => {
        if (mine === seq.current) setBusy(false);
      });
  }, [invId, tone, channel, lang, getDraft]);

  if (!snapshot) return <DataGate loading={loading} error={loadError} onRetry={refresh} />;

  const stage = stageForDaysOverdue(daysLate);
  const alreadySent = Boolean(invoice && stage && snapshot.reminders.some((r) => r.invoice_id === invoice.id && r.stage === stage));
  const canMark = Boolean(plan?.reminderCadence && canWrite(role) && stage);

  const copy = async () => {
    if (!draft) return;
    await Clipboard.setStringAsync(draft.text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const send = () => {
    if (!draft || !customer) return;
    const url =
      channel === "whatsapp"
        ? `https://wa.me/91${customer.phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(draft.body)}`
        : `mailto:${customer.email}?subject=${encodeURIComponent(draft.subject ?? "")}&body=${encodeURIComponent(draft.body)}`;
    Linking.openURL(url).catch(() => setError(channel === "whatsapp" ? "WhatsApp isn't installed on this phone." : "No email app is set up on this phone."));
  };

  const markSent = async () => {
    if (!invoice) return;
    setMarking(true);
    setError(null);
    try {
      await markReminderSent(invoice.id, channel);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarking(false);
    }
  };

  return (
    <View className="flex-1 bg-obsidian">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}>
        <BackHeader eyebrow="Draft reminder" title={customer?.name ?? "Reminder"} />
        <Text className="mt-3 text-[12px] text-mute">Review before sending. Nothing goes out automatically.</Text>

        {!customer || !invoice ? (
          <View className="mt-6">
            <EmptyState title="Nothing to remind about" body="This debtor has no unpaid invoices." />
          </View>
        ) : (
          <>
            <Label>Invoice</Label>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
              {unpaid.map((i) => {
                const late = daysBetween(i.due_date, today);
                return (
                  <Chip
                    key={i.id}
                    label={`${i.invoice_no} · ${formatINR(Number(i.amount))} · ${late > 0 ? `${late}d late` : "not due"}`}
                    active={i.id === invoice.id}
                    onPress={() => setInvoiceId(i.id)}
                    tone={late > 30 ? colors.crimson : colors.gold}
                  />
                );
              })}
            </ScrollView>

            <Label>Tone</Label>
            <View className="flex-row flex-wrap gap-2">
              {TONES.map((t) => (
                <Chip key={t.id} label={t.label} active={tone === t.id} onPress={() => setToneOverride(t.id)} tone={t.id === "firm" ? colors.crimson : colors.emerald} />
              ))}
            </View>

            <Label>Channel</Label>
            <View className="flex-row gap-2">
              <Chip label="WhatsApp" active={channel === "whatsapp"} onPress={() => setChannel("whatsapp")} tone={colors.emerald} />
              <Chip label="Email" active={channel === "email"} onPress={() => setChannel("email")} />
            </View>

            {channel === "whatsapp" && (
              <>
                <Label>Language</Label>
                <View className="flex-row gap-2">
                  <Chip label="English" active={lang === "en"} onPress={() => setLang("en")} />
                  <Chip label="हिंदी" active={lang === "hi"} onPress={() => setLang("hi")} />
                </View>
              </>
            )}

            {draft?.note ? <Notice>{draft.note}</Notice> : null}
            {draft?.statutory ? (
              <Notice tone={colors.emerald}>Statutory notice: cites the MSMED Act, 2006 and Section 43B(h). A template, not legal advice.</Notice>
            ) : null}
            {!plan?.upiLinks ? <Notice>UPI payment links in reminders are on the Solo Pro plan.</Notice> : null}

            <GlassCard style={{ marginTop: 16, minHeight: 160 }} className="p-4">
              {busy && !draft ? (
                <ActivityIndicator color={colors.mute} style={{ marginVertical: 48 }} />
              ) : error ? (
                <Text className="text-[13px] text-crimson">{error}</Text>
              ) : draft ? (
                <View style={{ opacity: busy ? 0.5 : 1 }}>
                  {draft.subject ? <Text className="mb-2 text-[13px] font-bold text-ink">Subject: {draft.subject}</Text> : null}
                  <Text selectable className="text-[14px] leading-6 text-ink">
                    {draft.body}
                  </Text>
                </View>
              ) : null}
            </GlassCard>

            <View className="mt-4 flex-row gap-2">
              <GhostButton label={copied ? "Copied ✓" : "Copy"} onPress={copy} disabled={!draft || busy} />
              <GhostButton
                label={channel === "whatsapp" ? "Open WhatsApp" : customer.email ? "Open email" : "No email saved"}
                tone={colors.emerald}
                onPress={send}
                disabled={!draft || busy || (channel === "email" && !customer.email)}
              />
            </View>

            {canMark && stage && (
              <View className="mt-4">
                <PrimaryButton
                  label={alreadySent ? `${STAGE_LABEL[stage]} already marked sent` : `I sent this · mark ${STAGE_LABEL[stage].toLowerCase()} sent`}
                  busy={marking}
                  disabled={!draft || alreadySent}
                  onPress={markSent}
                />
                <Text className="mt-2 text-center text-[11px] text-faint">The next stage shows up in your reminder queue when it's due.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
