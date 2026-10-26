import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Notice } from "@/components/Form";
import { GlassCard } from "@/components/GlassCard";
import { SectionTitle } from "@/components/ui";
import { buildQueue } from "@/lib/cadence";
import { formatINR, startOfToday, toISODate } from "@/lib/format";
import { daysBetween } from "@/lib/interest";
import type { PlanSpec } from "@/lib/plans";
import { colors } from "@/theme/tokens";
import type { DashboardSnapshot } from "@/types/vendor";

const STAGE_TONE = { 1: colors.emerald, 2: colors.gold, 3: colors.crimson } as const;

/**
 * Reminders due now (Day 1 / Day 16 / Day 31+ cadence), the same queue GET /api/reminders builds:
 * each overdue invoice once, at its current stage, until that stage is marked sent.
 */
export function ReminderQueue({ snapshot, plan, limit = 6 }: { snapshot: DashboardSnapshot; plan: PlanSpec | null; limit?: number }) {
  const router = useRouter();
  const queue = useMemo(() => {
    const today = toISODate(startOfToday());
    const names = new Map(snapshot.customers.map((c) => [c.id, c.name]));
    const sent = new Set(snapshot.reminders.map((r) => `${r.invoice_id}:${r.stage}`));
    return buildQueue(
      snapshot.invoices
        .filter((i) => i.status !== "Paid" && i.due_date < today)
        .map((i) => ({
          id: i.id,
          customerId: i.customer_id,
          customerName: names.get(i.customer_id) ?? "Customer",
          invoiceNo: i.invoice_no,
          amount: Number(i.amount),
          daysOverdue: daysBetween(i.due_date, today),
        })),
      sent,
    );
  }, [snapshot]);

  return (
    <View>
      <SectionTitle title="Reminders due" sub={plan?.reminderCadence ? `${queue.length} to send` : "Solo Pro"} />
      {!plan?.reminderCadence ? (
        <Notice>The Day 1 / 16 / 31 reminder cadence is on the Solo Pro plan. You can still draft a reminder from any client page.</Notice>
      ) : queue.length === 0 ? (
        <Text className="mt-3 text-[13px] text-mute">All caught up. Every overdue invoice has had its current reminder.</Text>
      ) : (
        <GlassCard style={{ marginTop: 12 }} className="py-1">
          {queue.slice(0, limit).map((q, i, arr) => (
            <Pressable
              key={q.invoiceId}
              onPress={() => {
                Haptics.selectionAsync();
                router.push({ pathname: "/reminder/[customerId]", params: { customerId: q.customerId, invoice: q.invoiceId } });
              }}
              className={`flex-row items-center px-4 py-3 ${i === arr.length - 1 ? "" : "border-b border-line"}`}
            >
              <View className="mr-3 h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_TONE[q.stage] }} />
              <View className="flex-1">
                <Text numberOfLines={1} className="text-[14px] font-bold text-ink">
                  {q.customerName}
                </Text>
                <Text className="mt-0.5 font-mono text-[10px] uppercase tracking-label" style={{ color: STAGE_TONE[q.stage] }}>
                  {q.stageLabel} · {q.invoiceNo} · {q.daysOverdue}d late
                </Text>
              </View>
              <Text className="text-[14px] font-bold text-ink">{formatINR(q.amount)}</Text>
              <Text className="ml-2 text-[16px] text-mute">›</Text>
            </Pressable>
          ))}
        </GlassCard>
      )}
    </View>
  );
}
