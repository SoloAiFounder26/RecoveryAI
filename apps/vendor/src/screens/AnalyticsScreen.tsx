import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackHeader } from "@/components/BackHeader";
import { Notice } from "@/components/Form";
import { GlassCard } from "@/components/GlassCard";
import { DataGate, SectionTitle } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { AGING_BUCKETS, agingReport, interestLines, monthSummary, paymentsOf, recoveryTrend } from "@/lib/analytics";
import { formatINR, formatINRCompact } from "@/lib/format";
import { checkStatutoryEligibility } from "@/lib/plans";
import { colors } from "@/theme/tokens";

const BUCKET_TONE = [colors.emerald, colors.gold, "#FF8A3D", colors.crimson, "#B3123F"];

/** Recovery analytics: month's recovery, 30-day trend, payment aging and MSMED interest. */
export function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { snapshot, metrics, loading, error, refresh, plan } = useVendorData();
  const [rate, setRate] = useState("6.5");

  const data = useMemo(() => {
    if (!snapshot || !metrics) return null;
    const payments = paymentsOf(snapshot);
    return {
      trend: recoveryTrend(payments),
      month: monthSummary(payments, metrics.pendingReceivables),
      aging: agingReport(snapshot),
      slow: [...snapshot.customers].filter((c) => Number(c.total_outstanding) > 0).sort((a, b) => b.overdue_days - a.overdue_days).slice(0, 3),
    };
  }, [snapshot, metrics]);

  if (!snapshot?.tenant || !data) return <DataGate loading={loading} error={error} onRetry={refresh} />;

  const tenant = snapshot.tenant;
  const profile = { number: tenant.udyam_number, category: tenant.udyam_category, registeredOn: tenant.udyam_registered_on };
  const eligibility = checkStatutoryEligibility(profile);
  const lines = plan?.agingDashboard ? interestLines(snapshot, profile, Number(rate)) : [];
  const totalInterest = lines.reduce((t, l) => t + l.interest, 0);

  return (
    <View className="flex-1 bg-obsidian">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}>
        <BackHeader eyebrow="Insights" title="Recovery analytics" />

        <View className="mt-5 flex-row gap-3">
          <GlassCard glow={colors.emerald} className="p-4" style={{ flex: 1 }}>
            <Text className="font-mono text-[10px] uppercase tracking-label text-mute">Recovered · month</Text>
            <Text className="mt-1 text-[20px] font-extrabold text-ink">{formatINRCompact(data.month.recovered)}</Text>
            {data.month.deltaPct !== null && (
              <Text className="mt-0.5 text-[11px] font-bold" style={{ color: data.month.deltaPct >= 0 ? colors.emerald : colors.crimson }}>
                {data.month.deltaPct >= 0 ? "▲ +" : "▼ "}
                {data.month.deltaPct}% vs last month
              </Text>
            )}
          </GlassCard>
          <GlassCard className="p-4" style={{ flex: 1 }}>
            <Text className="font-mono text-[10px] uppercase tracking-label text-mute">Recovery rate</Text>
            <Text className="mt-1 text-[20px] font-extrabold text-ink">{data.month.recoveryRate}%</Text>
            <Text className="mt-0.5 text-[11px] text-faint">of this month's recoverable</Text>
          </GlassCard>
        </View>

        <View className="mb-3 mt-8">
          <SectionTitle title="Recovery trend" sub="Last 30 days" />
        </View>
        <GlassCard className="p-4">
          {data.trend.length > 0 ? <TrendChart data={data.trend} /> : <Text className="py-6 text-center text-[13px] text-mute">No payments logged in the last 30 days yet.</Text>}
        </GlassCard>

        {plan?.agingDashboard ? (
          <>
            <View className="mb-3 mt-8">
              <SectionTitle title="Payment aging" sub={formatINRCompact(data.aging.grand)} />
            </View>
            <GlassCard className="p-4">
              {data.aging.grand === 0 ? (
                <Text className="py-4 text-center text-[13px] text-mute">No unpaid invoices.</Text>
              ) : (
                <>
                  <View className="h-3 flex-row overflow-hidden rounded-full bg-raised">
                    {AGING_BUCKETS.map((b, i) =>
                      data.aging.totals[b] > 0 ? <View key={b} style={{ width: `${(data.aging.totals[b] / data.aging.grand) * 100}%`, backgroundColor: BUCKET_TONE[i] }} /> : null,
                    )}
                  </View>
                  <View className="mt-3 flex-row">
                    {AGING_BUCKETS.map((b, i) => (
                      <View key={b} className="flex-1 items-center">
                        <Text className="font-mono text-[9px]" style={{ color: BUCKET_TONE[i] }}>
                          {b}
                        </Text>
                        <Text className="mt-0.5 text-[11px] font-bold text-ink">{formatINRCompact(data.aging.totals[b])}</Text>
                      </View>
                    ))}
                  </View>
                  <View className="mt-4 border-t border-line pt-2">
                    {data.aging.rows.slice(0, 8).map((r) => (
                      <Pressable key={r.customerId} onPress={() => router.push(`/client/${r.customerId}`)} className="flex-row items-center py-2">
                        <Text numberOfLines={1} className="flex-1 text-[13px] font-semibold text-ink">
                          {r.name}
                        </Text>
                        <View className="mx-3 h-1.5 w-20 flex-row overflow-hidden rounded-full bg-raised">
                          {AGING_BUCKETS.map((b, i) => (r.buckets[b] > 0 ? <View key={b} style={{ width: `${(r.buckets[b] / r.total) * 100}%`, backgroundColor: BUCKET_TONE[i] }} /> : null))}
                        </View>
                        <Text className="w-16 text-right text-[13px] font-bold text-ink">{formatINRCompact(r.total)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}
            </GlassCard>

            <View className="mb-3 mt-8">
              <SectionTitle title="MSMED interest" sub="Section 16 estimate" />
            </View>
            <GlassCard glow={colors.gold} className="p-4">
              <Text className="text-[12px] leading-5 text-mute">
                Three times the RBI Bank Rate, compounded monthly, from the appointed day. An estimate, not a legal computation.
              </Text>
              <Text className="mt-4 font-mono text-[10px] uppercase tracking-label text-mute">RBI Bank Rate (%) · check the current rate</Text>
              <View className="mt-2 h-12 flex-row items-center rounded-2xl border border-line bg-surface px-4">
                <TextInput
                  value={rate}
                  onChangeText={(t) => setRate(t.replace(/[^\d.]/g, "").slice(0, 5))}
                  keyboardType="decimal-pad"
                  style={{ flex: 1, minWidth: 0, color: colors.ink, fontSize: 16, fontWeight: "700" }}
                />
              </View>
              <Text className="mt-1.5 text-[12px] text-mute">Interest rate used: {(Number(rate) * 3 || 0).toFixed(2)}% a year (3× bank rate)</Text>
              {!eligibility.eligible ? (
                <>
                  <Notice>{eligibility.reason ?? ""}</Notice>
                  <Pressable onPress={() => router.push("/profile")} className="mt-2">
                    <Text className="text-[13px] font-bold text-gold">Open business profile ›</Text>
                  </Pressable>
                </>
              ) : lines.length === 0 ? (
                <Text className="mt-4 text-[13px] text-mute">No eligible overdue invoices accruing interest.</Text>
              ) : (
                <>
                  <Text className="mt-4 text-[26px] font-extrabold text-gold">{formatINR(totalInterest)}</Text>
                  <Text className="text-[11px] text-faint">estimated interest across {lines.length} invoices</Text>
                  <View className="mt-3">
                    {lines.slice(0, 6).map((l) => (
                      <View key={l.key} className="flex-row items-center border-t border-line py-2">
                        <Text numberOfLines={1} className="flex-1 text-[12px] font-semibold text-ink">
                          {l.name} · {l.invoiceNo}
                        </Text>
                        <Text className="font-mono text-[11px] text-mute">{l.daysOverdue}d</Text>
                        <Text className="ml-3 w-20 text-right text-[13px] font-bold text-ink">{formatINR(l.interest)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </GlassCard>
          </>
        ) : (
          <View className="mt-8">
            <Notice>The client payment aging dashboard and MSMED interest calculator are part of the MSME Growth plan.</Notice>
          </View>
        )}

        <View className="mb-3 mt-8">
          <SectionTitle title="Slowest payers" />
        </View>
        <View className="overflow-hidden rounded-3xl border border-line bg-surface">
          {data.slow.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/client/${c.id}`)}
              className={`flex-row items-center px-4 py-3 ${i === data.slow.length - 1 ? "" : "border-b border-line"}`}
            >
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-raised">
                <Text className="text-[13px] font-extrabold text-ink">{c.name[0]}</Text>
              </View>
              <View className="flex-1">
                <Text numberOfLines={1} className="text-[14px] font-bold text-ink">
                  {c.name}
                </Text>
                <Text className="text-[11px] text-crimson">{c.overdue_days} days overdue</Text>
              </View>
              <Text className="text-[14px] font-bold text-ink">{formatINRCompact(Number(c.total_outstanding))}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function TrendChart({ data }: { data: { label: string; value: number }[] }) {
  const [width, setWidth] = useState(300);
  const height = 120;
  const pad = 12;
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;
  const pts = data.map((d, i) => ({
    ...d,
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: height - pad - ((d.value - min) / range) * (height - pad * 2),
  }));
  const line = pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  const area = `${line} L ${pts[pts.length - 1].x} ${height - pad} L ${pts[0].x} ${height - pad} Z`;
  const last = pts[pts.length - 1];
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Text className="mb-1 text-right text-[13px] font-extrabold text-emerald">{formatINRCompact(last.value)}</Text>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.emerald} stopOpacity={0.3} />
            <Stop offset="1" stopColor={colors.emerald} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill="url(#trendFill)" />
        <Path d={line} stroke={colors.emerald} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p) => (
          <Circle key={p.label + p.x} cx={p.x} cy={p.y} r={p === last ? 4.5 : 2.5} fill={colors.emerald} />
        ))}
      </Svg>
      <View className="mt-1 flex-row justify-between">
        {pts.map((p) => (
          <Text key={p.label + p.x} className="font-mono text-[9px] text-faint">
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
