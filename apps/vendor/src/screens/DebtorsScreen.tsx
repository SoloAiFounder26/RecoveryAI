import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, SectionList, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BUCKET_COLOR, DebtorCard } from "@/components/DebtorCard";
import { PlusIcon } from "@/components/icons";
import type { SwipeTriggerResult } from "@/components/SwipeToRecoverSlider";
import { TAB_BAR_CLEARANCE } from "@/components/TabBar";
import { Chip, DataGate, EmptyState, Pill, ScreenTitle } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { formatINR, formatINRCompact } from "@/lib/format";
import { AGING_BUCKETS, type AgingBucket, type DebtorInvoice } from "@/lib/metrics";
import { toSwipeResult } from "@/screens/VendorDashboardScreen";
import { colors } from "@/theme/tokens";
import type { CustomerRow, RiskLevel } from "@/types/vendor";

type View_ = "invoices" | "clients";
type Severity = "all" | "current" | AgingBucket;
type Sort = "overdue" | "amount";

const MIN_AMOUNTS = [
  { label: "Any amount", value: 0 },
  { label: "₹50K+", value: 50_000 },
  { label: "₹1L+", value: 1_00_000 },
  { label: "₹5L+", value: 5_00_000 },
];

const RISK_TONE: Record<RiskLevel, string> = { High: colors.crimson, Medium: colors.gold, Low: colors.emerald };

/** Debtors & Invoices Matrix: every open invoice by aging bucket, or every client by exposure. */
export function DebtorsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { snapshot, metrics, error, loading, refreshing, refresh, requestCall } = useVendorData();

  const [view, setView] = useState<View_>("invoices");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity>("all");
  const [minAmount, setMinAmount] = useState(0);
  const [sort, setSort] = useState<Sort>("overdue");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const matches = useCallback(
    (c: CustomerRow | undefined, invoiceNo = "") =>
      !q || Boolean(c?.name.toLowerCase().includes(q) || c?.phone.includes(q) || c?.category?.toLowerCase().includes(q)) || invoiceNo.toLowerCase().includes(q),
    [q],
  );

  const sections = useMemo(() => {
    if (!metrics) return [];
    const rows = metrics.rows.filter(
      (r) =>
        Number(r.invoice.amount) >= minAmount &&
        (severity === "all" || (severity === "current" ? r.daysOverdue === 0 : r.daysOverdue > 0 && r.bucket === severity)) &&
        matches(r.customer, r.invoice.invoice_no),
    );
    const sorted = [...rows].sort((a, b) =>
      sort === "amount" ? Number(b.invoice.amount) - Number(a.invoice.amount) : b.daysOverdue - a.daysOverdue || Number(b.invoice.amount) - Number(a.invoice.amount),
    );
    const groups: { key: string; title: string; tone: string; total: number; data: DebtorInvoice[] }[] = [];
    for (const key of ["90+", "61-90", "31-60", "0-30", "current"] as const) {
      const data = sorted.filter((r) => (key === "current" ? r.daysOverdue === 0 : r.daysOverdue > 0 && r.bucket === key));
      if (data.length)
        groups.push({
          key,
          title: key === "current" ? "Not yet due" : `${key} days overdue`,
          tone: key === "current" ? colors.emerald : BUCKET_COLOR[key],
          total: data.reduce((t, r) => t + Number(r.invoice.amount), 0),
          data,
        });
    }
    return groups;
  }, [metrics, minAmount, severity, sort, matches]);

  const clients = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.customers
      .filter((c) => Number(c.total_outstanding) >= minAmount && matches(c))
      .sort((a, b) => (sort === "amount" ? Number(b.total_outstanding) - Number(a.total_outstanding) : b.overdue_days - a.overdue_days));
  }, [snapshot, minAmount, sort, matches]);

  const onToggle = useCallback((id: string) => setExpandedId((cur) => (cur === id ? null : id)), []);
  const onTriggerCall = useCallback(
    async (row: DebtorInvoice): Promise<SwipeTriggerResult> => toSwipeResult(await requestCall(row.invoice.customer_id, row.invoice.id)),
    [requestCall],
  );
  const openClient = useCallback((id: string) => router.push(`/client/${id}`), [router]);

  if (!snapshot || !metrics) return <DataGate loading={loading} error={error} onRetry={refresh} />;

  const invoiceCount = sections.reduce((t, s) => t + s.data.length, 0);

  const header = (
    <View style={{ paddingTop: insets.top + 8 }}>
      <ScreenTitle eyebrow="Customers & invoices" title={view === "invoices" ? `${invoiceCount} open invoices` : `${clients.length} clients`} />

      <View className="mt-4 flex-row rounded-full border border-line bg-surface p-1">
        {(["invoices", "clients"] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => {
              Haptics.selectionAsync();
              setView(v);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === v }}
            className="flex-1 items-center rounded-full py-2"
            style={{ backgroundColor: view === v ? colors.raised : "transparent" }}
          >
            <Text className="text-[13px] font-bold" style={{ color: view === v ? colors.ink : colors.mute }}>
              {v === "invoices" ? "Invoices" : "Clients"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="mt-3 h-12 flex-row items-center rounded-2xl border border-line bg-surface px-4">
        <Text className="mr-2 text-mute">⌕</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, invoice no., mobile, category"
          placeholderTextColor={colors.faint}
          autoCorrect={false}
          returnKeyType="search"
          style={{ flex: 1, color: colors.ink, fontSize: 15 }}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={10}>
            <Text className="text-mute">✕</Text>
          </Pressable>
        ) : null}
      </View>

      {view === "invoices" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-3" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          <Chip label="All" active={severity === "all"} onPress={() => setSeverity("all")} />
          {[...AGING_BUCKETS].reverse().map((b) => (
            <Chip key={b} label={`${b}d · ${formatINRCompact(metrics.aging[b])}`} tone={BUCKET_COLOR[b]} active={severity === b} onPress={() => setSeverity(b)} />
          ))}
          <Chip label="Not due" tone={colors.emerald} active={severity === "current"} onPress={() => setSeverity("current")} />
        </ScrollView>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-2" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {MIN_AMOUNTS.map((a) => (
          <Chip key={a.value} label={a.label} active={minAmount === a.value} onPress={() => setMinAmount(a.value)} />
        ))}
        <View className="mx-1 w-px self-stretch bg-line" />
        <Chip label="Most overdue" active={sort === "overdue"} onPress={() => setSort("overdue")} />
        <Chip label="Highest ₹" active={sort === "amount"} onPress={() => setSort("amount")} />
      </ScrollView>
      <View className="h-4" />
    </View>
  );

  const listProps = {
    contentContainerStyle: { paddingHorizontal: 20, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE + 64 },
    keyboardShouldPersistTaps: "handled" as const,
    keyboardDismissMode: "on-drag" as const,
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.mute} colors={[colors.emerald]} progressBackgroundColor={colors.surface} />,
  };

  return (
    <View className="flex-1 bg-obsidian">
      {view === "invoices" ? (
        <SectionList
          {...listProps}
          sections={sections}
          keyExtractor={(r) => r.invoice.id}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={header}
          renderSectionHeader={({ section }) => (
            <View className="mb-2 mt-2 flex-row items-center justify-between">
              <View className="flex-row items-center">
                <View className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: section.tone }} />
                <Text className="font-mono text-[11px] uppercase tracking-label" style={{ color: section.tone }}>
                  {section.title}
                </Text>
              </View>
              <Text className="font-mono text-[11px] text-mute">
                {section.data.length} · {formatINR(section.total)}
              </Text>
            </View>
          )}
          renderItem={({ item, index }) => (
            <DebtorCard
              row={item}
              index={index}
              expanded={expandedId === item.invoice.id}
              onToggle={onToggle}
              onTriggerCall={onTriggerCall}
              onOpenLedger={(r) => openClient(r.invoice.customer_id)}
            />
          )}
          ListEmptyComponent={<EmptyState title="No invoices match" body="Try another bucket, a lower amount, or clear the search." />}
        />
      ) : (
        <SectionList
          {...listProps}
          sections={[{ key: "clients", data: clients }]}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={header}
          renderItem={({ item }) => <ClientRow customer={item} onPress={() => openClient(item.id)} />}
          ListEmptyComponent={<EmptyState title="No clients match" body="Clear the search or lower the amount filter." />}
        />
      )}

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/add-invoice");
        }}
        accessibilityRole="button"
        accessibilityLabel="Add invoice"
        className="absolute h-14 w-14 items-center justify-center rounded-full bg-gold active:opacity-80"
        style={{
          right: 20,
          bottom: insets.bottom + TAB_BAR_CLEARANCE,
          shadowColor: colors.gold,
          shadowOpacity: 0.5,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        }}
      >
        <PlusIcon color={colors.obsidian} />
      </Pressable>
    </View>
  );
}

function ClientRow({ customer, onPress }: { customer: CustomerRow; onPress: () => void }) {
  const tone = RISK_TONE[customer.risk_level];
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="mb-3 rounded-3xl border border-line bg-surface p-4 active:opacity-90">
      <View className="flex-row items-center">
        <View className="h-11 w-11 items-center justify-center rounded-full border-2" style={{ borderColor: tone }}>
          <Text className="text-[13px] font-extrabold text-ink">{customer.ai_risk_score}</Text>
        </View>
        <View className="ml-3 flex-1">
          <Text numberOfLines={1} className="text-[16px] font-bold text-ink">
            {customer.name}
          </Text>
          <Text className="mt-0.5 font-mono text-[11px] text-faint">
            +91 {customer.phone}
            {customer.category ? ` · ${customer.category}` : ""}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[16px] font-extrabold text-ink" style={{ fontVariant: ["tabular-nums"] }}>
            {formatINR(Number(customer.total_outstanding))}
          </Text>
          <View className="mt-1">
            <Pill label={customer.overdue_days > 0 ? `${customer.overdue_days}d late` : "on time"} tone={customer.overdue_days > 90 ? colors.crimson : customer.overdue_days > 0 ? colors.gold : colors.emerald} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}
