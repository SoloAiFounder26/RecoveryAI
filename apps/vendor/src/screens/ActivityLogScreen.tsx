import { useMemo, useState } from "react";
import { ScrollView, SectionList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { BackHeader } from "@/components/BackHeader";
import { Chip, DataGate, EmptyState } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { formatDayMonth, formatINR } from "@/lib/format";
import { colors } from "@/theme/tokens";

type Kind = "invoice" | "call" | "reminder";
interface Entry {
  id: string;
  kind: Kind;
  at: Date;
  actor: string;
  action: string;
  detail: string;
}

const KIND_TONE: Record<Kind, string> = { invoice: colors.ink, call: colors.gold, reminder: colors.emerald };

/**
 * Timestamped log of everything that happened on the account. Built from the tenant's own
 * rows; the platform's admin_audit_log (with IPs) is visible to RecoveryAI staff only.
 */
export function ActivityLogScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { snapshot, error, loading, refresh } = useVendorData();
  const [filter, setFilter] = useState<"all" | Kind>("all");

  const sections = useMemo(() => {
    if (!snapshot) return [];
    const names = new Map(snapshot.customers.map((c) => [c.id, c.name]));
    const invoices = new Map(snapshot.invoices.map((i) => [i.id, i]));
    const me = session?.user.id;
    const entries: Entry[] = [
      ...snapshot.invoices.map((i) => ({
        id: `i-${i.id}`,
        kind: "invoice" as const,
        at: new Date(i.created_at),
        actor: "Team",
        action: `Invoice ${i.invoice_no} added`,
        detail: `${names.get(i.customer_id) ?? "Debtor"} · ${formatINR(Number(i.amount))} · due ${formatDayMonth(i.due_date)}`,
      })),
      ...snapshot.commitments.map((c) => ({
        id: `c-${c.id}`,
        kind: "call" as const,
        at: new Date(c.created_at),
        actor: c.audio_url ? "AI agent" : "Team / AI",
        action: `${c.interaction_type} logged`,
        detail: `${names.get(c.customer_id) ?? "Debtor"}${c.promised_amount ? ` · ${formatINR(Number(c.promised_amount))}` : ""}${
          c.promised_date && c.interaction_type === "Promise to Pay" ? ` · by ${formatDayMonth(c.promised_date)}` : ""
        }`,
      })),
      ...snapshot.reminders.map((r) => {
        const inv = invoices.get(r.invoice_id);
        return {
          id: `r-${r.id}`,
          kind: "reminder" as const,
          at: new Date(r.created_at),
          actor: r.created_by ? (r.created_by === me ? "You" : "Team member") : "Automation",
          action: `${r.channel === "whatsapp" ? "WhatsApp" : "Email"} reminder ${r.stage}/3 sent`,
          detail: inv ? `${names.get(inv.customer_id) ?? "Debtor"} · ${inv.invoice_no}` : "Invoice removed",
        };
      }),
    ]
      .filter((e) => filter === "all" || e.kind === filter)
      .sort((a, b) => b.at.getTime() - a.at.getTime());

    const out: { title: string; data: Entry[] }[] = [];
    for (const e of entries) {
      const title = `${formatDayMonth(e.at)} ${e.at.getFullYear()}`;
      const last = out[out.length - 1];
      if (last?.title === title) last.data.push(e);
      else out.push({ title, data: [e] });
    }
    return out;
  }, [snapshot, session, filter]);

  if (!snapshot) return <DataGate loading={loading} error={error} onRetry={refresh} />;

  return (
    <View className="flex-1 bg-obsidian">
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={
          <View>
            <BackHeader eyebrow="Audit" title="Activity log" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-4" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
              <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
              <Chip label="Invoices" active={filter === "invoice"} onPress={() => setFilter("invoice")} />
              <Chip label="Calls" active={filter === "call"} tone={colors.gold} onPress={() => setFilter("call")} />
              <Chip label="Reminders" active={filter === "reminder"} tone={colors.emerald} onPress={() => setFilter("reminder")} />
            </ScrollView>
            <Text className="mt-3 text-[11px] leading-4 text-faint">Times are this device's local time. Sign-in IPs are kept in the platform audit log.</Text>
          </View>
        }
        renderSectionHeader={({ section }) => <Text className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-label text-faint">{section.title}</Text>}
        renderItem={({ item, index, section }) => (
          <View className="flex-row">
            <View className="mr-3 w-12 items-end">
              <Text className="font-mono text-[11px] text-mute">{item.at.toTimeString().slice(0, 5)}</Text>
            </View>
            <View className="items-center">
              <View className="mt-1 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: KIND_TONE[item.kind] }} />
              {index < section.data.length - 1 && <View className="w-px flex-1 bg-line" />}
            </View>
            <View className="ml-3 flex-1 pb-4">
              <Text className="text-[13px] font-semibold text-ink">{item.action}</Text>
              <Text className="mt-0.5 text-[12px] text-mute">{item.detail}</Text>
              <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-label text-faint">{item.actor}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="mt-6">
            <EmptyState title="No activity yet" />
          </View>
        }
      />
    </View>
  );
}
