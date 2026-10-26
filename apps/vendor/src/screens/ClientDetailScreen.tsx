import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { CallRecordingPlayer } from "@/components/CallRecordingPlayer";
import { LogOutcomeSheet, PauseAiSheet } from "@/components/ClientSheets";
import { GlassCard } from "@/components/GlassCard";
import { BackIcon } from "@/components/icons";
import { RollingRupeeCounter } from "@/components/RollingRupeeCounter";
import { SwipeToRecoverSlider } from "@/components/SwipeToRecoverSlider";
import { DataGate, EmptyState, GhostButton, Pill, SectionTitle } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { daysBetween, formatDayMonth, formatINR, parseISODate, startOfToday } from "@/lib/format";
import { daysOverdue, paymentBehaviour, sentimentOf, type Sentiment } from "@/lib/metrics";
import { toSwipeResult } from "@/screens/VendorDashboardScreen";
import { colors } from "@/theme/tokens";
import type { CommitmentRow, InvoiceRow, ReminderEventRow } from "@/types/vendor";

const SENTIMENT_TONE: Record<Sentiment, string> = { positive: colors.emerald, neutral: colors.mute, negative: colors.crimson };
const SENTIMENT_LABEL: Record<Sentiment, string> = { positive: "Positive", neutral: "Neutral", negative: "Negative" };

type TimelineItem = { kind: "call"; at: string; row: CommitmentRow } | { kind: "reminder"; at: string; row: ReminderEventRow; invoiceNo: string };

/**
 * Detailed client view: outstanding, payment behaviour score, invoice ledger, AI call
 * transcripts + recordings, promised dates, and the manual overrides.
 */
export function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { snapshot, error, loading, refresh, refreshing, requestCall, pauseAi, logInteraction } = useVendorData();
  const pauseRef = useRef<BottomSheetModal>(null);
  const outcomeRef = useRef<BottomSheetModal>(null);
  const [showPaid, setShowPaid] = useState(false);

  const customer = snapshot?.customers.find((c) => c.id === id);

  const data = useMemo(() => {
    if (!snapshot || !customer) return null;
    const invoices = snapshot.invoices.filter((i) => i.customer_id === customer.id).sort((a, b) => b.due_date.localeCompare(a.due_date));
    const invoiceNo = new Map(invoices.map((i) => [i.id, i.invoice_no]));
    const calls = snapshot.commitments.filter((c) => c.customer_id === customer.id);
    const timeline: TimelineItem[] = [
      ...calls.map((row) => ({ kind: "call" as const, at: row.created_at, row })),
      ...snapshot.reminders
        .filter((r) => invoiceNo.has(r.invoice_id))
        .map((row) => ({ kind: "reminder" as const, at: row.created_at, row, invoiceNo: invoiceNo.get(row.invoice_id) ?? "" })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return {
      invoices,
      timeline,
      behaviour: paymentBehaviour(customer, snapshot.commitments),
      oldestOpen: invoices.filter((i) => i.status !== "Paid").sort((a, b) => a.due_date.localeCompare(b.due_date))[0],
    };
  }, [snapshot, customer]);

  if (!snapshot) return <DataGate loading={loading} error={error} onRetry={refresh} />;
  if (!customer || !data) {
    return (
      <View className="flex-1 justify-center bg-obsidian px-6">
        <EmptyState title="Client not found" body="They may have been removed on the web app." />
        <View className="mt-4 flex-row">
          <GhostButton label="Back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const today = startOfToday();
  const promise = customer.active_promise_date ? parseISODate(customer.active_promise_date) : null;
  const pausedUntil = promise && promise > today ? customer.active_promise_date : null;
  const promiseToday = promise && daysBetween(promise, today) === 0;
  const visibleInvoices = showPaid ? data.invoices : data.invoices.filter((i) => i.status !== "Paid");
  const paidCount = data.invoices.length - data.invoices.filter((i) => i.status !== "Paid").length;

  return (
    <View className="flex-1 bg-obsidian">
      <LinearGradient colors={["#14141F", colors.obsidian]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 360 }} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.mute} colors={[colors.emerald]} progressBackgroundColor={colors.surface} />}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="mr-3 h-10 w-10 items-center justify-center rounded-full border border-line bg-surface"
          >
            <BackIcon color={colors.ink} />
          </Pressable>
          <View className="flex-1">
            <Text numberOfLines={1} className="text-[20px] font-extrabold text-ink">
              {customer.name}
            </Text>
            <Text className="font-mono text-[11px] text-faint">
              +91 {customer.phone}
              {customer.category ? ` · ${customer.category}` : ""}
            </Text>
          </View>
        </View>

        {/* Outstanding + behaviour score */}
        <Animated.View entering={FadeInDown.duration(450)} style={{ marginTop: 20 }}>
          <GlassCard glow={customer.overdue_days > 90 ? colors.crimson : colors.gold} className="p-5">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="font-mono text-[10px] uppercase tracking-label text-mute">Outstanding</Text>
                <View className="mt-2">
                  <RollingRupeeCounter value={Number(customer.total_outstanding)} fontSize={32} />
                </View>
                <Text className="mt-1 text-[13px] text-mute">
                  {customer.overdue_days > 0 ? `Oldest ${customer.overdue_days} days late` : "Nothing overdue"}
                </Text>
              </View>
              <ScoreRing score={data.behaviour.score} />
            </View>

            <View className="mt-4 flex-row gap-2">
              <Stat label="Kept" value={`${data.behaviour.kept}`} tone={colors.emerald} />
              <Stat label="Broken" value={`${data.behaviour.broken}`} tone={data.behaviour.broken ? colors.crimson : colors.ink} />
              <Stat
                label="Kept %"
                value={data.behaviour.reliability === null ? "—" : `${Math.round(data.behaviour.reliability * 100)}%`}
                tone={colors.ink}
              />
              <Stat label="AI risk" value={`${customer.ai_risk_score}`} tone={customer.risk_level === "High" ? colors.crimson : colors.ink} />
            </View>

            {customer.ai_insight ? (
              <View className="mt-4 flex-row rounded-2xl border border-line bg-obsidian/60 p-3">
                <Text className="mr-2 font-mono text-[11px] text-emerald">AI</Text>
                <Text className="flex-1 text-[13px] leading-5 text-mute">{customer.ai_insight}</Text>
              </View>
            ) : null}
          </GlassCard>
        </Animated.View>

        {/* Promise / AI status */}
        {(pausedUntil || promiseToday || (promise && promise < today)) && (
          <View
            className="mt-3 flex-row items-center rounded-2xl border px-4 py-3"
            style={{
              borderColor: pausedUntil ? "rgba(0,229,153,0.3)" : promiseToday ? "rgba(255,184,0,0.35)" : "rgba(255,51,102,0.35)",
              backgroundColor: pausedUntil ? "rgba(0,229,153,0.08)" : promiseToday ? "rgba(255,184,0,0.08)" : "rgba(255,51,102,0.08)",
            }}
          >
            <Text className="flex-1 text-[13px] font-semibold" style={{ color: pausedUntil ? colors.emerald : promiseToday ? colors.gold : colors.crimson }}>
              {pausedUntil
                ? `Promised to pay by ${formatDayMonth(pausedUntil)} · AI calls paused`
                : promiseToday
                  ? "Promised to pay today · AI will follow up"
                  : `Promise of ${formatDayMonth(customer.active_promise_date!)} missed`}
            </Text>
          </View>
        )}

        {/* Actions */}
        <View className="mt-4 flex-row gap-2">
          <GhostButton
            label="WhatsApp"
            onPress={() => {
              const due = data.oldestOpen;
              const text = due
                ? `Namaste ${customer.name}, a gentle reminder that ${formatINR(Number(customer.total_outstanding))} is pending (oldest invoice ${due.invoice_no}, due ${formatDayMonth(due.due_date)}). Please share a payment date.`
                : `Namaste ${customer.name},`;
              Linking.openURL(`https://wa.me/91${customer.phone}?text=${encodeURIComponent(text)}`).catch(() => {});
            }}
          />
          <GhostButton label="Call" onPress={() => Linking.openURL(`tel:+91${customer.phone}`).catch(() => {})} />
          <GhostButton label={pausedUntil ? "AI paused" : "Pause AI"} tone={pausedUntil ? colors.emerald : colors.gold} onPress={() => pauseRef.current?.present()} />
        </View>
        <View className="mt-2 flex-row">
          <GhostButton label="Log call outcome / payment" onPress={() => outcomeRef.current?.present()} />
        </View>
        {Number(customer.total_outstanding) > 0 && (
          <View className="mt-3">
            <SwipeToRecoverSlider
              label="Swipe · start AI recovery call"
              disabled={Boolean(pausedUntil)}
              disabledLabel="AI calls paused · promise active"
              onTrigger={async () => toSwipeResult(await requestCall(customer.id, data.oldestOpen?.id))}
            />
          </View>
        )}

        {/* Ledger */}
        <View className="mb-3 mt-8">
          <SectionTitle
            title="Invoice ledger"
            right={
              paidCount > 0 ? (
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowPaid((v) => !v);
                  }}
                >
                  <Text className="font-mono text-[10px] uppercase tracking-label text-emerald">{showPaid ? "Hide paid" : `Show ${paidCount} paid`}</Text>
                </Pressable>
              ) : undefined
            }
          />
        </View>
        <View className="overflow-hidden rounded-3xl border border-line bg-surface">
          {visibleInvoices.length === 0 ? (
            <Text className="p-5 text-center text-[13px] text-mute">No open invoices.</Text>
          ) : (
            visibleInvoices.map((inv, i) => <LedgerRow key={inv.id} invoice={inv} last={i === visibleInvoices.length - 1} />)
          )}
        </View>

        {/* Calls, transcripts, reminders */}
        <View className="mb-3 mt-8">
          <SectionTitle title="AI calls & reminders" sub={`${data.timeline.length} events`} />
        </View>
        {data.timeline.length === 0 ? (
          <EmptyState title="No calls or reminders yet" body="Outcomes from AI calls and the WhatsApp reminder chain show up here." />
        ) : (
          data.timeline.map((item) => (item.kind === "call" ? <TranscriptCard key={item.row.id} row={item.row} /> : <ReminderRow key={item.row.id} row={item.row} invoiceNo={item.invoiceNo} />))
        )}
      </ScrollView>

      <PauseAiSheet ref={pauseRef} name={customer.name} pausedUntil={pausedUntil} onSubmit={(until) => pauseAi(customer.id, until)} />
      <LogOutcomeSheet
        ref={outcomeRef}
        name={customer.name}
        outstanding={Number(customer.total_outstanding)}
        onSubmit={(input) => logInteraction({ customerId: customer.id, ...input })}
      />
    </View>
  );
}

function ScoreRing({ score }: { score: number }) {
  const size = 84;
  const r = 36;
  const c = 2 * Math.PI * r;
  const tone = score >= 70 ? colors.emerald : score >= 40 ? colors.gold : colors.crimson;
  return (
    <View className="items-center">
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.raised} strokeWidth={8} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-[22px] font-extrabold" style={{ color: tone }}>
            {score}
          </Text>
        </View>
      </View>
      <Text className="mt-1 font-mono text-[9px] uppercase tracking-label text-faint">Pay score</Text>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-line bg-obsidian/50 px-2.5 py-2">
      <Text numberOfLines={1} className="font-mono text-[8px] uppercase tracking-label text-faint">
        {label}
      </Text>
      <Text className="mt-1 text-[15px] font-bold" style={{ color: tone }}>
        {value}
      </Text>
    </View>
  );
}

function LedgerRow({ invoice, last }: { invoice: InvoiceRow; last: boolean }) {
  const paid = invoice.status === "Paid";
  const late = daysOverdue(invoice.due_date);
  const dueIn = -daysBetween(parseISODate(invoice.due_date), startOfToday());
  const tag = paid ? { label: "Paid", tone: colors.emerald } : late > 0 ? { label: `${late}d late`, tone: late > 90 ? colors.crimson : colors.gold } : { label: dueIn === 0 ? "Due today" : `Due in ${dueIn}d`, tone: colors.mute };
  return (
    <View className={`flex-row items-center px-4 py-3.5 ${last ? "" : "border-b border-line"}`}>
      <View className="flex-1">
        <Text className="font-mono text-[13px] text-ink">{invoice.invoice_no}</Text>
        <Text className="mt-0.5 text-[11px] text-faint">
          {invoice.invoice_date ? `Raised ${formatDayMonth(invoice.invoice_date)} · ` : ""}Due {formatDayMonth(invoice.due_date)}
        </Text>
      </View>
      <View className="items-end">
        <Text className="text-[15px] font-bold" style={{ color: paid ? colors.mute : colors.ink, textDecorationLine: paid ? "line-through" : "none" }}>
          {formatINR(Number(invoice.amount))}
        </Text>
        <View className="mt-1">
          <Pill label={tag.label} tone={tag.tone} />
        </View>
      </View>
    </View>
  );
}

export function TranscriptCard({ row, title }: { row: CommitmentRow; title?: string }) {
  const [open, setOpen] = useState(false);
  const sentiment = sentimentOf(row);
  const tone = SENTIMENT_TONE[sentiment];
  const at = new Date(row.created_at);
  const long = (row.notes?.length ?? 0) > 140;
  return (
    <Pressable
      onPress={() => long && setOpen((v) => !v)}
      className="mb-3 rounded-3xl border border-line bg-surface p-4"
      accessibilityRole={long ? "button" : undefined}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: tone }} />
          <Text className="text-[14px] font-bold text-ink">{title ?? row.interaction_type}</Text>
        </View>
        <Text className="font-mono text-[10px] text-faint">
          {formatDayMonth(at)} · {at.toTimeString().slice(0, 5)}
        </Text>
      </View>
      <View className="mt-2 flex-row flex-wrap gap-1.5">
        {title ? <Pill label={row.interaction_type} tone={colors.ink} /> : null}
        <Pill label={SENTIMENT_LABEL[sentiment]} tone={tone} />
        {row.promised_amount ? <Pill label={formatINR(Number(row.promised_amount))} tone={colors.ink} /> : null}
        {row.promised_date && row.interaction_type === "Promise to Pay" ? <Pill label={`by ${formatDayMonth(row.promised_date)}`} tone={colors.gold} /> : null}
        {row.interaction_type === "Promise to Pay" ? (
          <Pill label={row.status} tone={row.status === "kept" ? colors.emerald : row.status === "broken" ? colors.crimson : colors.mute} />
        ) : null}
      </View>
      {row.notes ? (
        <Text numberOfLines={open ? undefined : 3} className="mt-3 text-[13px] leading-5 text-mute">
          “{row.notes}”
        </Text>
      ) : (
        <Text className="mt-3 text-[12px] italic text-faint">No transcript saved for this call.</Text>
      )}
      {row.audio_url ? <CallRecordingPlayer uri={row.audio_url} /> : null}
    </Pressable>
  );
}

function ReminderRow({ row, invoiceNo }: { row: ReminderEventRow; invoiceNo: string }) {
  const at = new Date(row.created_at);
  return (
    <View className="mb-3 flex-row items-center rounded-2xl border border-line bg-abyss px-4 py-3">
      <View className="mr-3 h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: row.channel === "whatsapp" ? "rgba(0,229,153,0.12)" : "rgba(138,138,158,0.15)" }}>
        <Text className="text-[11px] font-extrabold" style={{ color: row.channel === "whatsapp" ? colors.emerald : colors.mute }}>
          {row.channel === "whatsapp" ? "WA" : "@"}
        </Text>
      </View>
      <View className="flex-1">
        <Text className="text-[13px] font-semibold text-ink">
          Reminder {row.stage}/3 · {row.channel === "whatsapp" ? "WhatsApp" : "Email"}
        </Text>
        <Text className="font-mono text-[10px] text-faint">{invoiceNo}</Text>
      </View>
      <Text className="font-mono text-[10px] text-faint">
        {formatDayMonth(at)} · {at.toTimeString().slice(0, 5)}
      </Text>
    </View>
  );
}
