import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { memo, useEffect } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { SwipeToRecoverSlider, type SwipeTriggerResult } from "@/components/SwipeToRecoverSlider";
import { formatDayMonth, formatINR } from "@/lib/format";
import type { AgingBucket, DebtorInvoice } from "@/lib/metrics";
import { colors } from "@/theme/tokens";

// Overdue severity ramp: amber (pending) → crimson (90+ critical).
export const BUCKET_COLOR: Record<AgingBucket, string> = {
  "0-30": colors.gold,
  "31-60": "#FF9533",
  "61-90": "#FF6A4D",
  "90+": colors.crimson,
};
/** Days at which the overdue bar is full. Anything past 120 days is pinned at 100%. */
const BAR_FULL_AT_DAYS = 120;

interface Props {
  row: DebtorInvoice;
  expanded: boolean;
  onToggle: (invoiceId: string) => void;
  onTriggerCall: (row: DebtorInvoice) => Promise<SwipeTriggerResult>;
  /** Opens the client's full ledger. Hidden until the detail screen exists. */
  onOpenLedger?: (row: DebtorInvoice) => void;
  index?: number;
}

/**
 * One overdue invoice. Collapsed: debtor, amount, aging tag, overdue bar.
 * Tap to expand into the AI insight, quick WhatsApp / phone actions, and the
 * swipe-to-recover slider.
 */
export const DebtorCard = memo(function DebtorCard({ row, expanded, onToggle, onTriggerCall, onOpenLedger, index = 0 }: Props) {
  const { invoice, customer, daysOverdue, bucket, aiPaused } = row;
  const notDue = daysOverdue === 0;
  const tone = notDue ? colors.emerald : BUCKET_COLOR[bucket];
  const name = customer?.name ?? "Unknown debtor";
  const amount = Number(invoice.amount);

  const fill = useSharedValue(0);
  const chevron = useSharedValue(0);

  useEffect(() => {
    fill.value = withDelay(120 + index * 40, withSpring(Math.min(daysOverdue / BAR_FULL_AT_DAYS, 1), { damping: 18, stiffness: 90 }));
  }, [daysOverdue, fill, index]);

  useEffect(() => {
    chevron.value = withTiming(expanded ? 1 : 0, { duration: 220 });
  }, [chevron, expanded]);

  const barStyle = useAnimatedStyle(() => ({ width: `${Math.max(fill.value * 100, 2)}%` }));
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chevron.value * 180}deg` }] }));

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(invoice.id);
  };

  const phone = customer?.phone ?? "";
  const whatsapp = () => {
    Haptics.selectionAsync();
    const text = `Namaste ${name}, a gentle reminder that invoice ${invoice.invoice_no} for ${formatINR(amount)} was due on ${formatDayMonth(invoice.due_date)}. Please share a payment date.`;
    Linking.openURL(`https://wa.me/91${phone}?text=${encodeURIComponent(text)}`).catch(() => {});
  };
  const call = () => {
    Haptics.selectionAsync();
    Linking.openURL(`tel:+91${phone}`).catch(() => {});
  };

  return (
    <Animated.View
      layout={LinearTransition.springify().damping(20).stiffness(180)}
      style={{ marginBottom: 12, overflow: "hidden", borderRadius: 24, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}
    >
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${name}, ${formatINR(amount)}, ${notDue ? "not yet due" : `${daysOverdue} days overdue`}`}
        className="px-4 pb-4 pt-4 active:opacity-90"
      >
        <View className="flex-row items-start">
          <Avatar name={name} tone={tone} />
          <View className="ml-3 flex-1">
            <Text numberOfLines={1} className="text-[16px] font-bold text-ink">
              {name}
            </Text>
            <Text numberOfLines={1} className="mt-0.5 font-mono text-[11px] text-faint">
              {invoice.invoice_no} · due {formatDayMonth(invoice.due_date)}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-[17px] font-extrabold text-ink" style={{ fontVariant: ["tabular-nums"] }}>
              {formatINR(amount)}
            </Text>
            <AgingTag label={notDue ? "Current" : `${bucket} days`} tone={tone} />
          </View>
        </View>

        <View className="mt-4 flex-row items-center">
          <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
            <Animated.View style={[{ height: "100%", borderRadius: 999, overflow: "hidden" }, barStyle]}>
              <LinearGradient colors={[colors.gold, tone]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
            </Animated.View>
          </View>
          <Text className="ml-3 w-[74px] text-right font-mono text-[11px]" style={{ color: tone }}>
            {notDue ? "NOT DUE" : `${daysOverdue}D LATE`}
          </Text>
          <Animated.View style={[{ marginLeft: 6 }, chevronStyle]}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M6 9l6 6 6-6" stroke={colors.mute} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        </View>

        {aiPaused && customer?.active_promise_date && (
          <View className="mt-3 flex-row items-center self-start rounded-full border border-emerald/30 bg-emerald/10 px-2.5 py-1">
            <View className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald" />
            <Text className="font-mono text-[10px] uppercase tracking-label text-emerald">
              Promised {formatDayMonth(customer.active_promise_date)} · AI paused
            </Text>
          </View>
        )}
      </Pressable>

      {expanded && (
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(120)}
          style={{ borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.abyss, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12 }}
        >
          {customer?.ai_insight ? (
            <View className="mb-3 flex-row">
              <Text className="mr-2 font-mono text-[11px] text-emerald">AI</Text>
              <Text className="flex-1 text-[13px] leading-5 text-mute">{customer.ai_insight}</Text>
            </View>
          ) : null}

          <View className="mb-3 flex-row gap-2">
            <Stat label="Risk score" value={`${customer?.ai_risk_score ?? 0}/100`} tone={(customer?.ai_risk_score ?? 0) >= 70 ? colors.crimson : colors.ink} />
            <Stat label="Broken promises" value={`${customer?.broken_promises_count ?? 0}`} tone={(customer?.broken_promises_count ?? 0) > 0 ? colors.gold : colors.ink} />
            <Stat label="Total owed" value={formatINR(Number(customer?.total_outstanding ?? amount))} tone={colors.ink} />
          </View>

          <View className="mb-3 flex-row gap-2">
            <ActionChip label="WhatsApp" onPress={whatsapp} disabled={!phone} />
            <ActionChip label="Call" onPress={call} disabled={!phone} />
            {onOpenLedger && <ActionChip label="Ledger" onPress={() => onOpenLedger(row)} />}
          </View>

          <SwipeToRecoverSlider
            label={`Swipe · AI call ${firstWord(name)}`}
            disabled={aiPaused}
            disabledLabel="AI calls paused · promise active"
            onTrigger={() => onTriggerCall(row)}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
});

function AgingTag({ label, tone }: { label: string; tone: string }) {
  return (
    <View className="mt-1.5 rounded-full px-2 py-0.5" style={{ backgroundColor: `${tone}1A`, borderWidth: 1, borderColor: `${tone}40` }}>
      <Text className="font-mono text-[10px] uppercase tracking-label" style={{ color: tone }}>
        {label}
      </Text>
    </View>
  );
}

function Avatar({ name, tone }: { name: string; tone: string }) {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  return (
    <View className="h-11 w-11 items-center justify-center rounded-2xl border bg-raised" style={{ borderColor: `${tone}55` }}>
      <Text className="text-[14px] font-extrabold" style={{ color: tone }}>
        {initials || "?"}
      </Text>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-line bg-surface px-3 py-2">
      <Text className="font-mono text-[9px] uppercase tracking-label text-faint">{label}</Text>
      <Text numberOfLines={1} className="mt-1 text-[13px] font-bold" style={{ color: tone }}>
        {value}
      </Text>
    </View>
  );
}

function ActionChip({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className="flex-1 items-center rounded-full border border-line bg-surface py-2.5 active:bg-raised"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Text className="text-[13px] font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}

function firstWord(name: string) {
  return name.split(/\s+/)[0] ?? name;
}
