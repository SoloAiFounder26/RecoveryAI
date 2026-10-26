import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { BUCKET_COLOR, DebtorCard } from "@/components/DebtorCard";
import { DsoGauge } from "@/components/DsoGauge";
import { GlassCard } from "@/components/GlassCard";
import { RollingRupeeCounter } from "@/components/RollingRupeeCounter";
import type { SwipeTriggerResult } from "@/components/SwipeToRecoverSlider";
import { useVendorDashboard } from "@/hooks/useVendorDashboard";
import { formatINR, formatINRCompact } from "@/lib/format";
import { AGING_BUCKETS, type AgingBucket, type DashboardMetrics, type DebtorInvoice } from "@/lib/metrics";
import { requestRecoveryCall } from "@/lib/vendorApi";
import { colors } from "@/theme/tokens";
import type { Plan, RecoveryPlanRow } from "@/types/vendor";

type Filter = "all" | AgingBucket;

const PLAN_LABEL: Record<Plan, string> = { free: "Free", pro: "Pro", growth: "Growth" };

const QUEUE_REASON: Record<RecoveryPlanRow["queue_reason"], { label: string; tone: string }> = {
  promised_today: { label: "Promised today", tone: colors.emerald },
  broken_promise: { label: "Broke promise", tone: colors.crimson },
  high_risk_overdue: { label: "High risk", tone: colors.gold },
};

/**
 * Command Vault: the vendor's home. Everything on it is derived from the tenant's own
 * invoices / customers / commitments / reminder_events, read through RLS.
 */
export function VendorDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { snapshot, metrics, error, loading, refreshing, refresh, isSample } = useVendorDashboard();

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [focusCustomer, setFocusCustomer] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!metrics) return [];
    const q = query.trim().toLowerCase();
    return metrics.rows.filter(
      (r) =>
        (filter === "all" || r.bucket === filter) &&
        (!focusCustomer || r.invoice.customer_id === focusCustomer) &&
        (!q || r.customer?.name.toLowerCase().includes(q) || r.invoice.invoice_no.toLowerCase().includes(q) || r.customer?.phone.includes(q)),
    );
  }, [metrics, filter, query, focusCustomer]);

  const onToggle = useCallback((id: string) => setExpandedId((cur) => (cur === id ? null : id)), []);

  const onTriggerCall = useCallback(
    async (row: DebtorInvoice): Promise<SwipeTriggerResult> => {
      if (isSample) {
        await new Promise((r) => setTimeout(r, 1100));
        return { ok: true, message: "AI call queued · sample" };
      }
      const res = await requestRecoveryCall({ customerId: row.invoice.customer_id, invoiceId: row.invoice.id });
      return { ok: res.status === "queued", message: res.message };
    },
    [isSample],
  );

  const pickFilter = (f: Filter) => {
    Haptics.selectionAsync();
    setFilter(f);
    setExpandedId(null);
  };

  const pickDebtor = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFocusCustomer((cur) => (cur === id ? null : id));
    setFilter("all");
    setExpandedId(null);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-obsidian">
        <ActivityIndicator color={colors.mute} />
        <Text className="mt-3 font-mono text-[11px] uppercase tracking-label text-faint">Opening vault</Text>
      </View>
    );
  }

  if (error || !snapshot || !metrics) {
    return (
      <View className="flex-1 items-center justify-center bg-obsidian px-8">
        <Text className="text-center text-lg font-bold text-ink">Couldn't load your receivables</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-mute">{error}</Text>
        <Pressable onPress={refresh} className="mt-6 rounded-full bg-emerald px-6 py-3 active:opacity-80">
          <Text className="font-extrabold text-obsidian">Try again</Text>
        </Pressable>
        <Pressable onPress={signOut} className="mt-3 px-6 py-3">
          <Text className="text-sm font-semibold text-faint">Sign out</Text>
        </Pressable>
      </View>
    );
  }

  const focusName = focusCustomer ? snapshot.customers.find((c) => c.id === focusCustomer)?.name : null;

  const header = (
    <View>
      {/* Top bar */}
      <Animated.View entering={FadeInDown.duration(400)} style={{ paddingTop: insets.top + 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View className="flex-1 pr-3">
          <Text className="font-mono text-[10px] uppercase tracking-label text-faint">Command Vault</Text>
          <Text numberOfLines={1} className="mt-1 text-[20px] font-extrabold text-ink">
            {snapshot.tenant?.business_name}
          </Text>
        </View>
        <View className="mr-2 rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1">
          <Text className="font-mono text-[10px] uppercase tracking-label text-emerald">{snapshot.tenant ? PLAN_LABEL[snapshot.tenant.plan] : "—"}</Text>
        </View>
        <Pressable onPress={signOut} accessibilityLabel="Sign out" className="h-10 w-10 items-center justify-center rounded-full border border-line bg-surface">
          <Text className="text-[13px] font-bold text-mute">⏻</Text>
        </Pressable>
      </Animated.View>

      {isSample && (
        <View className="mt-3 self-start rounded-full border border-gold/40 bg-gold/10 px-3 py-1">
          <Text className="font-mono text-[10px] uppercase tracking-label text-gold">Sample data · test login</Text>
        </View>
      )}

      {/* Hero: rolling receivables */}
      <Animated.View entering={FadeInDown.delay(80).duration(500)} style={{ marginTop: 20 }}>
        <GlassCard glow={colors.gold} className="p-5">
          <Text className="font-mono text-[10px] uppercase tracking-label text-mute">Total pending market receivables</Text>
          <View className="mt-3">
            <RollingRupeeCounter value={metrics.pendingReceivables} fontSize={40} />
          </View>
          <Text className="mt-2 text-[13px] text-mute">
            {metrics.openInvoiceCount} open invoices · {metrics.debtorCount} debtors
          </Text>
          <AgingBar metrics={metrics} />
        </GlassCard>
      </Animated.View>

      {/* DSO + KPIs */}
      <Animated.View entering={FadeInDown.delay(160).duration(500)} style={{ marginTop: 12, flexDirection: "row", gap: 12 }}>
        <GlassCard style={{ flex: 1.1 }} className="items-center px-3 pb-4 pt-5">
          <DsoGauge dso={metrics.dso} avgDaysOverdue={metrics.avgDaysOverdue} />
        </GlassCard>
        <View style={{ flex: 1, gap: 12 }}>
          <Kpi label="Recovered this month" value={formatINRCompact(metrics.recoveredThisMonth)} tone={colors.emerald} />
          <Kpi label="Call outcomes · month" value={`${metrics.callOutcomesThisMonth}`} sub={`${metrics.promisesThisMonth} ${metrics.promisesThisMonth === 1 ? "promise" : "promises"} to pay`} tone={colors.ink} />
        </View>
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(220).duration(500)} style={{ marginTop: 12 }}>
        <Kpi label="WhatsApp reminders sent · month" value={`${metrics.whatsappRemindersThisMonth}`} tone={colors.emerald} wide />
      </Animated.View>

      {/* Story carousel: AI's call-first queue */}
      {snapshot.recoveryPlan.length > 0 && (
        <View className="mt-7">
          <SectionTitle title="Needs action now" sub={`${snapshot.recoveryPlan.length} flagged by AI`} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-3" contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {snapshot.recoveryPlan.map((p, i) => (
              <Animated.View key={p.customer_id} entering={FadeInRight.delay(260 + i * 60).duration(420)}>
                <StoryCard row={p} active={focusCustomer === p.customer_id} onPress={() => pickDebtor(p.customer_id)} />
              </Animated.View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Matrix controls */}
      <View className="mt-7">
        <SectionTitle title="Overdue matrix" sub={`${rows.length} invoices`} />
        <View className="mt-3 h-12 flex-row items-center rounded-2xl border border-line bg-surface px-4">
          <Text className="mr-2 text-mute">⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search debtor, invoice no. or mobile"
            placeholderTextColor={colors.faint}
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, color: colors.ink, fontSize: 15 }}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-3" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          <Chip label="All" active={filter === "all"} onPress={() => pickFilter("all")} />
          {AGING_BUCKETS.map((b) => (
            <Chip key={b} label={`${b}d · ${formatINRCompact(metrics.aging[b])}`} tone={BUCKET_COLOR[b]} active={filter === b} onPress={() => pickFilter(b)} />
          ))}
        </ScrollView>
        {focusName && (
          <Pressable onPress={() => setFocusCustomer(null)} className="mt-3 flex-row items-center self-start rounded-full border border-line bg-raised px-3 py-1.5">
            <Text className="text-[12px] font-semibold text-ink">{focusName}</Text>
            <Text className="ml-2 text-[12px] text-mute">✕</Text>
          </Pressable>
        )}
      </View>
      <View className="h-4" />
    </View>
  );

  return (
    <View className="flex-1 bg-obsidian">
      <LinearGradient colors={["#14141F", colors.obsidian]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 420 }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.invoice.id}
        renderItem={({ item, index }) => (
          <DebtorCard row={item} index={index} expanded={expandedId === item.invoice.id} onToggle={onToggle} onTriggerCall={onTriggerCall} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View className="items-center rounded-3xl border border-line bg-surface p-8">
            <Text className="text-[15px] font-bold text-ink">{metrics.openInvoiceCount === 0 ? "Nothing pending. Nice." : "No invoices match"}</Text>
            <Text className="mt-1 text-center text-[13px] text-mute">
              {metrics.openInvoiceCount === 0 ? "Every invoice is marked paid." : "Try another bucket or clear the search."}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              refresh();
            }}
            tintColor={colors.mute}
            colors={[colors.emerald]}
            progressBackgroundColor={colors.surface}
          />
        }
      />
    </View>
  );
}

function AgingBar({ metrics }: { metrics: DashboardMetrics }) {
  const total = metrics.pendingReceivables || 1;
  return (
    <View className="mt-5">
      <View className="h-2 flex-row overflow-hidden rounded-full bg-raised">
        {AGING_BUCKETS.map((b) =>
          metrics.aging[b] > 0 ? <View key={b} style={{ flex: metrics.aging[b] / total, backgroundColor: BUCKET_COLOR[b], marginRight: 2 }} /> : null,
        )}
      </View>
      <View className="mt-3 flex-row justify-between">
        {AGING_BUCKETS.map((b) => (
          <View key={b}>
            <View className="flex-row items-center">
              <View className="mr-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BUCKET_COLOR[b] }} />
              <Text className="font-mono text-[10px] text-faint">{b}D</Text>
            </View>
            <Text className="mt-0.5 text-[12px] font-bold text-ink">{formatINRCompact(metrics.aging[b])}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Kpi({ label, value, sub, tone, wide }: { label: string; value: string; sub?: string; tone: string; wide?: boolean }) {
  return (
    <GlassCard glow={tone === colors.ink ? undefined : tone} style={{ flex: wide ? undefined : 1 }} className={wide ? "flex-row items-center justify-between px-4 py-4" : "justify-center px-4 py-4"}>
      <Text className="font-mono text-[9px] uppercase tracking-label text-mute">{label}</Text>
      <View className={wide ? "items-end" : "mt-2"}>
        <Text className="text-[24px] font-extrabold" style={{ color: tone, fontVariant: ["tabular-nums"] }}>
          {value}
        </Text>
        {sub && <Text className="font-mono text-[10px] text-faint">{sub}</Text>}
      </View>
    </GlassCard>
  );
}

function StoryCard({ row, active, onPress }: { row: RecoveryPlanRow; active: boolean; onPress: () => void }) {
  const reason = QUEUE_REASON[row.queue_reason];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} className="active:opacity-80">
      <LinearGradient
        colors={active ? [reason.tone, `${reason.tone}33`] : [`${reason.tone}88`, "#26263600"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 22, padding: 1.5, width: 156 }}
      >
        <View className="rounded-[21px] bg-surface p-4" style={{ height: 172 }}>
          <View className="flex-row items-center justify-between">
            <View className="h-10 w-10 items-center justify-center rounded-full border-2" style={{ borderColor: reason.tone }}>
              <Text className="text-[13px] font-extrabold text-ink">{row.ai_risk_score}</Text>
            </View>
            <Text className="font-mono text-[9px] text-faint">{row.overdue_days}D</Text>
          </View>
          <Text numberOfLines={2} className="mt-3 text-[14px] font-bold leading-5 text-ink">
            {row.name}
          </Text>
          <View className="flex-1" />
          <Text className="text-[17px] font-extrabold text-ink" style={{ fontVariant: ["tabular-nums"] }}>
            {formatINR(Number(row.total_outstanding))}
          </Text>
          <Text className="mt-1 font-mono text-[9px] uppercase tracking-label" style={{ color: reason.tone }}>
            {reason.label}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function Chip({ label, active, onPress, tone = colors.ink }: { label: string; active: boolean; onPress: () => void; tone?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="rounded-full border px-4 py-2"
      style={{ borderColor: active ? tone : colors.line, backgroundColor: active ? `${tone}1F` : colors.surface }}
    >
      <Text className="text-[13px] font-semibold" style={{ color: active ? tone : colors.mute }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View className="flex-row items-end justify-between">
      <Text className="text-[17px] font-extrabold text-ink">{title}</Text>
      {sub && <Text className="font-mono text-[10px] uppercase tracking-label text-faint">{sub}</Text>}
    </View>
  );
}
