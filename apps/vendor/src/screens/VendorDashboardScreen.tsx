import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BUCKET_COLOR, DebtorCard } from "@/components/DebtorCard";
import { DsoGauge } from "@/components/DsoGauge";
import { GlassCard } from "@/components/GlassCard";
import { RollingRupeeCounter } from "@/components/RollingRupeeCounter";
import type { SwipeTriggerResult } from "@/components/SwipeToRecoverSlider";
import { TAB_BAR_CLEARANCE } from "@/components/TabBar";
import { DataGate, GhostButton, SectionTitle } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { formatINR, formatINRCompact } from "@/lib/format";
import { AGING_BUCKETS, type DashboardMetrics, type DebtorInvoice } from "@/lib/metrics";
import { colors } from "@/theme/tokens";
import { PLAN_LABEL, type RecoveryPlanRow } from "@/types/vendor";

/** How many of the most overdue invoices the Vault previews before "See all". */
const PREVIEW_ROWS = 4;

export const QUEUE_REASON: Record<RecoveryPlanRow["queue_reason"], { label: string; tone: string }> = {
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
  const router = useRouter();
  const { snapshot, metrics, error, loading, refreshing, refresh, isSample, requestCall } = useVendorData();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const onToggle = useCallback((id: string) => setExpandedId((cur) => (cur === id ? null : id)), []);
  const onTriggerCall = useCallback(
    async (row: DebtorInvoice): Promise<SwipeTriggerResult> => toSwipeResult(await requestCall(row.invoice.customer_id, row.invoice.id)),
    [requestCall],
  );
  const openClient = useCallback((row: DebtorInvoice) => router.push(`/client/${row.invoice.customer_id}`), [router]);

  if (!snapshot || !metrics) return <DataGate loading={loading} error={error} onRetry={refresh} />;

  const preview = metrics.rows.filter((r) => r.daysOverdue > 0).slice(0, PREVIEW_ROWS);

  return (
    <View className="flex-1 bg-obsidian">
      <LinearGradient colors={["#14141F", colors.obsidian]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 420 }} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
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
      >
        {/* Top bar */}
        <Animated.View entering={FadeInDown.duration(400)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View className="flex-1 pr-3">
            <Text className="font-mono text-[10px] uppercase tracking-label text-faint">Command Vault</Text>
            <Text numberOfLines={1} className="mt-1 text-[20px] font-extrabold text-ink">
              {snapshot.tenant?.business_name}
            </Text>
          </View>
          <Pressable
            onPress={() => router.navigate("/account")}
            accessibilityLabel="Plan and account"
            className="rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1"
          >
            <Text className="font-mono text-[10px] uppercase tracking-label text-emerald">{snapshot.tenant ? PLAN_LABEL[snapshot.tenant.plan] : "—"}</Text>
          </Pressable>
        </Animated.View>

        {isSample && (
          <View className="mt-3 self-start rounded-full border border-gold/40 bg-gold/10 px-3 py-1">
            <Text className="font-mono text-[10px] uppercase tracking-label text-gold">Sample data · test login</Text>
          </View>
        )}
        {error && (
          <Text className="mt-3 font-mono text-[10px] uppercase tracking-label text-crimson">Offline · showing last sync</Text>
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
            <Kpi
              label="AI call outcomes · month"
              value={`${metrics.callOutcomesThisMonth}`}
              sub={`${metrics.promisesThisMonth} ${metrics.promisesThisMonth === 1 ? "promise" : "promises"} to pay`}
              tone={colors.ink}
            />
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(220).duration(500)} style={{ marginTop: 12 }}>
          <Pressable onPress={() => router.navigate("/dispatch")} accessibilityRole="button">
            <Kpi label="WhatsApp reminders sent · month" value={`${metrics.whatsappRemindersThisMonth}`} tone={colors.emerald} wide />
          </Pressable>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(260).duration(500)} style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
          <GhostButton label="Analytics" tone={colors.emerald} onPress={() => router.push("/analytics")} />
          <GhostButton label="Bulk import" tone={colors.gold} onPress={() => router.push("/import")} />
          <GhostButton label="Add invoice" onPress={() => router.push("/add-invoice")} />
        </Animated.View>

        {/* Story carousel: AI's call-first queue */}
        {snapshot.recoveryPlan.length > 0 && (
          <View className="mt-7">
            <SectionTitle title="Needs action now" sub={`${snapshot.recoveryPlan.length} flagged by AI`} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-3" contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
              {snapshot.recoveryPlan.map((p, i) => (
                <Animated.View key={p.customer_id} entering={FadeInRight.delay(260 + i * 60).duration(420)}>
                  <StoryCard
                    row={p}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push(`/client/${p.customer_id}`);
                    }}
                  />
                </Animated.View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Most overdue preview */}
        <View className="mb-3 mt-7">
          <SectionTitle title="Most overdue" sub={`${metrics.rows.filter((r) => r.daysOverdue > 0).length} late invoices`} />
        </View>
        {preview.map((row, index) => (
          <DebtorCard
            key={row.invoice.id}
            row={row}
            index={index}
            expanded={expandedId === row.invoice.id}
            onToggle={onToggle}
            onTriggerCall={onTriggerCall}
            onOpenLedger={openClient}
          />
        ))}
        <View className="flex-row">
          <GhostButton label="See all debtors & invoices" onPress={() => router.navigate("/debtors")} />
        </View>
      </ScrollView>
    </View>
  );
}

/** Map the dialer's answer onto the slider's end state. */
export function toSwipeResult(res: { status: string; message: string }): SwipeTriggerResult {
  return { ok: res.status === "queued", message: res.message };
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

function StoryCard({ row, onPress }: { row: RecoveryPlanRow; onPress: () => void }) {
  const active = row.priority_rank === 1;
  const reason = QUEUE_REASON[row.queue_reason];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="active:opacity-80">
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

