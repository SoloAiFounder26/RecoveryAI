import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, SectionList, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassCard } from "@/components/GlassCard";
import { ReminderQueue } from "@/components/ReminderQueue";
import { TAB_BAR_CLEARANCE } from "@/components/TabBar";
import { Chip, DataGate, EmptyState, Pill, ScreenTitle, SectionTitle } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { addDays, formatDayMonth, formatINR, formatINRCompact, startOfToday } from "@/lib/format";
import { sentimentOf } from "@/lib/metrics";
import { QUEUE_REASON } from "@/screens/VendorDashboardScreen";
import { colors } from "@/theme/tokens";
import type { CommitmentRow, ReminderEventRow } from "@/types/vendor";

type Filter = "all" | "calls" | "whatsapp" | "email";

type FeedItem =
  | { kind: "call"; id: string; at: Date; customerId: string; name: string; row: CommitmentRow }
  | { kind: "reminder"; id: string; at: Date; customerId: string; name: string; invoiceNo: string; amount: number; row: ReminderEventRow };

const SENTIMENT_TONE = { positive: colors.emerald, neutral: colors.mute, negative: colors.crimson } as const;

/**
 * Live Recovery Dispatch Hub: today's AI call queue and a feed of call outcomes and
 * WhatsApp / email reminder-chain sends, refreshed every 30 s while the app is open.
 */
export function DispatchHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { snapshot, error, loading, refresh, refreshing, isSample, plan } = useVendorData();
  const [filter, setFilter] = useState<Filter>("all");

  const feed = useMemo(() => {
    if (!snapshot) return { sections: [], today: { calls: 0, reminders: 0, promised: 0 } };
    const names = new Map(snapshot.customers.map((c) => [c.id, c.name]));
    const invoices = new Map(snapshot.invoices.map((i) => [i.id, i]));
    const items: FeedItem[] = [
      ...snapshot.commitments.map((row) => ({
        kind: "call" as const,
        id: row.id,
        at: new Date(row.created_at),
        customerId: row.customer_id,
        name: names.get(row.customer_id) ?? "Debtor",
        row,
      })),
      ...snapshot.reminders.flatMap((row) => {
        const inv = invoices.get(row.invoice_id);
        if (!inv) return [];
        return [
          {
            kind: "reminder" as const,
            id: row.id,
            at: new Date(row.created_at),
            customerId: inv.customer_id,
            name: names.get(inv.customer_id) ?? "Debtor",
            invoiceNo: inv.invoice_no,
            amount: Number(inv.amount),
            row,
          },
        ];
      }),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    const today = startOfToday();
    const todays = items.filter((i) => i.at >= today);
    const filtered = items.filter(
      (i) => filter === "all" || (filter === "calls" ? i.kind === "call" : i.kind === "reminder" && i.row.channel === filter),
    );

    const sections: { title: string; data: FeedItem[] }[] = [];
    for (const item of filtered) {
      const title = dayLabel(item.at);
      const last = sections[sections.length - 1];
      if (last?.title === title) last.data.push(item);
      else sections.push({ title, data: [item] });
    }
    return {
      sections,
      today: {
        calls: todays.filter((i) => i.kind === "call").length,
        reminders: todays.filter((i) => i.kind === "reminder").length,
        promised: todays
          .filter((i): i is Extract<FeedItem, { kind: "call" }> => i.kind === "call" && i.row.interaction_type === "Promise to Pay")
          .reduce((t, i) => t + Number(i.row.promised_amount ?? 0), 0),
      },
    };
  }, [snapshot, filter]);

  if (!snapshot) return <DataGate loading={loading} error={error} onRetry={refresh} />;

  const open = (customerId: string) => {
    Haptics.selectionAsync();
    router.push(`/client/${customerId}`);
  };

  const header = (
    <View style={{ paddingTop: insets.top + 8 }}>
      <ScreenTitle eyebrow="Calls & reminders" title="Reminders" right={<LiveBadge fetchedAt={snapshot.fetchedAt} sample={isSample} stale={Boolean(error)} />} />

      <View className="mt-5 flex-row gap-2">
        <Counter label="Calls today" value={`${feed.today.calls}`} tone={colors.ink} />
        <Counter label="Reminders today" value={`${feed.today.reminders}`} tone={colors.emerald} />
        <Counter label="Promised today" value={formatINRCompact(feed.today.promised)} tone={colors.gold} />
      </View>

      <View className="mt-7">
        <ReminderQueue snapshot={snapshot} plan={plan} />
      </View>

      {snapshot.recoveryPlan.length > 0 && (
        <View className="mt-7">
          <SectionTitle title="AI call queue" sub={`${snapshot.recoveryPlan.length} in queue`} />
          <GlassCard style={{ marginTop: 12 }} className="py-1">
            {snapshot.recoveryPlan.slice(0, 6).map((p, i, arr) => {
              const reason = QUEUE_REASON[p.queue_reason];
              return (
                <Pressable
                  key={p.customer_id}
                  onPress={() => open(p.customer_id)}
                  className={`flex-row items-center px-4 py-3 ${i === arr.length - 1 ? "" : "border-b border-line"}`}
                >
                  <Text className="w-6 font-mono text-[12px] text-faint">{i + 1}</Text>
                  <View className="flex-1">
                    <Text numberOfLines={1} className="text-[14px] font-bold text-ink">
                      {p.name}
                    </Text>
                    <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-label" style={{ color: reason.tone }}>
                      {reason.label}
                    </Text>
                  </View>
                  <Text className="text-[14px] font-bold text-ink">{formatINR(Number(p.total_outstanding))}</Text>
                </Pressable>
              );
            })}
          </GlassCard>
          <Text className="mt-2 text-[11px] leading-4 text-faint">
            Debtors with a future promise are skipped automatically. Pause or resume one from their client page.
          </Text>
        </View>
      )}

      <View className="mt-7">
        <SectionTitle title="Activity feed" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-3" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
        <Chip label="AI calls" active={filter === "calls"} onPress={() => setFilter("calls")} tone={colors.gold} />
        <Chip label="WhatsApp" active={filter === "whatsapp"} onPress={() => setFilter("whatsapp")} tone={colors.emerald} />
        <Chip label="Email" active={filter === "email"} onPress={() => setFilter("email")} />
      </ScrollView>
      <View className="h-2" />
    </View>
  );

  return (
    <View className="flex-1 bg-obsidian">
      <SectionList
        sections={feed.sections}
        keyExtractor={(i) => `${i.kind}-${i.id}`}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.mute} colors={[colors.emerald]} progressBackgroundColor={colors.surface} />}
        renderSectionHeader={({ section }) => <Text className="mb-2 mt-4 font-mono text-[10px] uppercase tracking-label text-faint">{section.title}</Text>}
        renderItem={({ item }) => <FeedRow item={item} onPress={() => open(item.customerId)} />}
        ListEmptyComponent={<EmptyState title="Nothing dispatched yet" body="AI call outcomes and reminder sends will stream in here." />}
      />
    </View>
  );
}

function FeedRow({ item, onPress }: { item: FeedItem; onPress: () => void }) {
  const time = item.at.toTimeString().slice(0, 5);
  if (item.kind === "call") {
    const s = sentimentOf(item.row);
    return (
      <Pressable onPress={onPress} className="mb-2 flex-row rounded-2xl border border-line bg-surface p-3.5 active:opacity-90">
        <View className="mr-3 h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${colors.gold}1F` }}>
          <Text className="text-[11px] font-extrabold text-gold">AI</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <Text numberOfLines={1} className="flex-1 pr-2 text-[14px] font-bold text-ink">
              {item.name}
            </Text>
            <Text className="font-mono text-[10px] text-faint">{time}</Text>
          </View>
          <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
            <Pill label={item.row.interaction_type} tone={SENTIMENT_TONE[s]} />
            {item.row.promised_amount ? <Text className="text-[12px] font-semibold text-ink">{formatINR(Number(item.row.promised_amount))}</Text> : null}
            {item.row.promised_date && item.row.interaction_type === "Promise to Pay" ? (
              <Text className="text-[12px] text-mute">by {formatDayMonth(item.row.promised_date)}</Text>
            ) : null}
          </View>
          {item.row.notes ? (
            <Text numberOfLines={2} className="mt-1.5 text-[12px] leading-4 text-mute">
              “{item.row.notes}”
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  }
  const wa = item.row.channel === "whatsapp";
  return (
    <Pressable onPress={onPress} className="mb-2 flex-row items-center rounded-2xl border border-line bg-abyss p-3.5 active:opacity-90">
      <View className="mr-3 h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: wa ? "rgba(0,229,153,0.12)" : "rgba(138,138,158,0.15)" }}>
        <Text className="text-[11px] font-extrabold" style={{ color: wa ? colors.emerald : colors.mute }}>
          {wa ? "WA" : "@"}
        </Text>
      </View>
      <View className="flex-1">
        <Text numberOfLines={1} className="text-[14px] font-semibold text-ink">
          {item.name}
        </Text>
        <Text className="mt-0.5 font-mono text-[10px] text-faint">
          Reminder {item.row.stage}/3 · {item.invoiceNo} · {formatINRCompact(item.amount)}
        </Text>
      </View>
      <Text className="font-mono text-[10px] text-faint">{time}</Text>
    </Pressable>
  );
}

function Counter({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-line bg-surface px-3 py-3">
      <Text numberOfLines={2} className="font-mono text-[9px] uppercase tracking-label text-faint">
        {label}
      </Text>
      <Text className="mt-1.5 text-[20px] font-extrabold" style={{ color: tone }}>
        {value}
      </Text>
    </View>
  );
}

function LiveBadge({ fetchedAt, sample, stale }: { fetchedAt: string; sample: boolean; stale: boolean }) {
  const pulse = useSharedValue(1);
  const [, tick] = useState(0);
  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(0.25, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [pulse]);
  const dot = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const secs = Math.max(0, Math.round((Date.now() - new Date(fetchedAt).getTime()) / 1000));
  const tone = stale ? colors.crimson : colors.emerald;
  return (
    <View className="items-end">
      <View className="flex-row items-center rounded-full border px-3 py-1" style={{ borderColor: `${tone}55`, backgroundColor: `${tone}14` }}>
        <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone, marginRight: 6 }, dot]} />
        <Text className="font-mono text-[10px] uppercase tracking-label" style={{ color: tone }}>
          {stale ? "Offline" : sample ? "Sample" : "Live"}
        </Text>
      </View>
      <Text className="mt-1 font-mono text-[9px] text-faint">synced {secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`} ago</Text>
    </View>
  );
}

function dayLabel(d: Date) {
  const today = startOfToday();
  if (d >= today) return "Today";
  if (d >= addDays(today, -1)) return "Yesterday";
  return formatDayMonth(d);
}
