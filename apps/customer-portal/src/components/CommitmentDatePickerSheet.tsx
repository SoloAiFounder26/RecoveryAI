import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  addDays,
  daysBetween,
  formatDayMonth,
  formatINR,
  formatOrdinalDayMonth,
  formatWeekdayDayMonth,
  startOfToday,
  toISODate,
} from "@/lib/format";
import { submitCommitment } from "@/lib/portalApi";
import { isSupabaseConfigured } from "@/lib/supabase";
import { colors } from "@/theme/tokens";
import type { CommitmentResult, PortalAccount } from "@/types/portal";

// The furthest a debtor can self-commit without talking to the vendor.
// Enforced again server-side in fn_portal_set_commitment.
export const MAX_COMMIT_DAYS = 30;
const MIN_COMMIT_DAYS = 1;
const THUMB = 28;
const SPRING = { damping: 18, stiffness: 240 };

export interface CommitmentDatePickerSheetRef {
  present: (account: PortalAccount) => void;
  dismiss: () => void;
}

interface Props {
  maxDays?: number;
  onCommitted?: (result: CommitmentResult, account: PortalAccount) => void;
}

type Mode = "full" | "part";

/**
 * "I will pay on 5th Nov". The debtor drags a day slider (haptic tick per day),
 * or taps a quick pick, optionally sets a part amount, and confirms. The backend
 * logs a Promise to Pay and sets customers.active_promise_date, which drops the
 * account out of the AI recovery call queue until that date.
 */
export const CommitmentDatePickerSheet = forwardRef<CommitmentDatePickerSheetRef, Props>(function CommitmentDatePickerSheet(
  { maxDays = MAX_COMMIT_DAYS, onCommitted },
  ref,
) {
  const sheet = useRef<BottomSheetModal>(null);
  const [account, setAccount] = useState<PortalAccount | null>(null);
  const [dayOffset, setDayOffset] = useState(7);
  const [mode, setMode] = useState<Mode>("full");
  const [partAmount, setPartAmount] = useState("");
  const [state, setState] = useState<"editing" | "saving" | "done">("editing");
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(startOfToday, []);
  const date = addDays(today, dayOffset);

  useImperativeHandle(ref, () => ({
    present: (a) => {
      setAccount(a);
      setMode("full");
      setPartAmount("");
      setError(null);
      setState("editing");
      setDayOffset(Math.min(7, maxDays));
      sheet.current?.present();
    },
    dismiss: () => sheet.current?.dismiss(),
  }));

  const outstanding = account?.total_outstanding ?? 0;
  const parsedPart = Number(partAmount.replace(/[^\d.]/g, ""));
  const amount = mode === "full" ? outstanding : parsedPart;
  const amountValid = mode === "full" || (parsedPart >= 1 && parsedPart <= outstanding);

  const confirm = async () => {
    if (!account || !amountValid || state === "saving") return;
    setState("saving");
    setError(null);
    try {
      const result = isSupabaseConfigured
        ? await submitCommitment({
            customerId: account.customer_id,
            promisedDate: toISODate(date),
            promisedAmount: amount,
            note: mode === "part" ? "Part payment committed from customer portal" : undefined,
          })
        : { commitmentId: "mock", activePromiseDate: toISODate(date) };
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState("done");
      onCommitted?.(result, account);
      setTimeout(() => sheet.current?.dismiss(), 1400);
    } catch (e) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : "Could not save your commitment. Please try again.");
      setState("editing");
    }
  };

  const renderBackdrop = useCallback(
    (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.72} pressBehavior="close" />,
    [],
  );

  const quickPicks = useMemo(() => buildQuickPicks(today, maxDays), [today, maxDays]);

  return (
    <BottomSheetModal
      ref={sheet}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 28 }}
      handleIndicatorStyle={{ backgroundColor: colors.line, width: 44 }}
    >
      <BottomSheetView style={{ paddingHorizontal: 20, paddingBottom: 36 }}>
        {state === "done" ? (
          <DoneState date={date} amount={amount} vendor={account?.vendor_name ?? ""} />
        ) : (
          <>
            <Text className="font-mono text-[11px] uppercase tracking-label text-gold">Commit a payment date</Text>
            <Text className="mt-2 text-2xl font-extrabold text-ink">When will you pay?</Text>
            <Text className="mt-1 text-sm text-mute">
              {account?.vendor_name} · {formatINR(outstanding)} outstanding
            </Text>

            <View className="mt-6 items-center rounded-3xl border border-line bg-abyss px-4 py-5">
              <Text className="font-mono text-[11px] uppercase tracking-label text-mute">I will pay on</Text>
              <Text className="mt-1 text-[34px] font-extrabold text-ink">{formatOrdinalDayMonth(date)}</Text>
              <Text className="mt-1 font-mono text-xs text-faint">
                {formatWeekdayDayMonth(date)} · in {dayOffset} {dayOffset === 1 ? "day" : "days"}
              </Text>
              <DaySlider value={dayOffset} min={MIN_COMMIT_DAYS} max={maxDays} onChange={setDayOffset} />
              <View className="mt-1 w-full flex-row justify-between">
                <Text className="font-mono text-[10px] text-faint">{formatDayMonth(addDays(today, MIN_COMMIT_DAYS))}</Text>
                <Text className="font-mono text-[10px] text-faint">{formatDayMonth(addDays(today, maxDays))}</Text>
              </View>
            </View>

            <View className="mt-4 flex-row flex-wrap gap-2">
              {quickPicks.map((q) => (
                <Chip
                  key={q.label}
                  label={q.label}
                  active={q.offset === dayOffset}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setDayOffset(q.offset);
                  }}
                />
              ))}
            </View>

            <Text className="mt-6 font-mono text-[11px] uppercase tracking-label text-mute">Amount</Text>
            <View className="mt-2 flex-row gap-2">
              <Chip label={`Full · ${formatINR(outstanding)}`} active={mode === "full"} onPress={() => setMode("full")} grow />
              <Chip label="Part payment" active={mode === "part"} onPress={() => setMode("part")} grow />
            </View>
            {mode === "part" && (
              <View className="mt-3 flex-row items-center rounded-2xl border border-line bg-abyss px-4">
                <Text className="text-xl font-bold text-mute">₹</Text>
                <BottomSheetTextInput
                  value={partAmount}
                  onChangeText={setPartAmount}
                  keyboardType="number-pad"
                  placeholder="Enter amount"
                  placeholderTextColor={colors.faint}
                  maxLength={10}
                  style={{ flex: 1, color: colors.ink, fontSize: 20, fontWeight: "700", paddingVertical: 14, paddingHorizontal: 8 }}
                />
              </View>
            )}
            {mode === "part" && partAmount !== "" && !amountValid && (
              <Text className="mt-2 text-xs text-crimson">Enter an amount between ₹1 and {formatINR(outstanding)}.</Text>
            )}

            <View className="mt-5 flex-row rounded-2xl border border-gold/30 bg-gold/10 p-3">
              <View className="mr-3 mt-1 flex-row gap-[3px]">
                <View className="h-3 w-[3px] rounded-sm bg-gold" />
                <View className="h-3 w-[3px] rounded-sm bg-gold" />
              </View>
              <Text className="flex-1 text-[13px] leading-5 text-ink">
                AI reminder calls from {account?.vendor_name ?? "this vendor"} pause until{" "}
                <Text className="font-bold text-gold">{formatDayMonth(date)}</Text>. If the date passes unpaid, reminders resume.
              </Text>
            </View>

            {error && <Text className="mt-3 text-sm text-crimson">{error}</Text>}

            <Pressable
              onPress={confirm}
              disabled={!amountValid || state === "saving"}
              accessibilityRole="button"
              accessibilityLabel={`Commit to pay ${formatINR(amount)} on ${formatOrdinalDayMonth(date)}`}
              className="mt-5 h-14 items-center justify-center rounded-full bg-gold active:opacity-80"
              style={{ opacity: amountValid ? 1 : 0.4 }}
            >
              {state === "saving" ? (
                <ActivityIndicator color={colors.obsidian} />
              ) : (
                <Text className="text-base font-extrabold text-obsidian">Commit to {formatOrdinalDayMonth(date)}</Text>
              )}
            </Pressable>
          </>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

function DaySlider({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const width = useSharedValue(0);
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const span = max - min;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width - THUMB;
    width.value = w;
    x.value = ((value - min) / span) * w;
  };

  const emit = (v: number) => {
    Haptics.selectionAsync();
    onChange(v);
  };

  // Keep the thumb in sync when a quick pick changes the value from outside.
  const external = useSharedValue(value);
  const dragging = useSharedValue(false);
  useEffect(() => {
    external.value = value;
  }, [external, value]);
  useAnimatedReaction(
    () => external.value,
    (v, prev) => {
      if (!dragging.value && prev !== null && v !== prev && width.value > 0) {
        x.value = withSpring(((v - min) / span) * width.value, SPRING);
      }
    },
  );

  const toDay = (px: number) => {
    "worklet";
    return Math.round((px / Math.max(width.value, 1)) * span) + min;
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14]) // let vertical drags move the sheet instead
    .onStart(() => {
      dragging.value = true;
      start.value = x.value;
    })
    .onUpdate((e) => {
      x.value = Math.min(Math.max(start.value + e.translationX, 0), width.value);
      const d = toDay(x.value);
      if (d !== external.value) {
        external.value = d;
        scheduleOnRN(emit, d);
      }
    })
    .onEnd(() => {
      x.value = withSpring(((toDay(x.value) - min) / span) * width.value, SPRING);
    })
    .onFinalize(() => {
      dragging.value = false;
    });

  const tap = Gesture.Tap().onEnd((e) => {
    const px = Math.min(Math.max(e.x - THUMB / 2, 0), width.value);
    const d = toDay(px);
    x.value = withSpring(((d - min) / span) * width.value, SPRING);
    if (d !== external.value) {
      external.value = d;
      scheduleOnRN(emit, d);
    }
  });

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const fill = useAnimatedStyle(() => ({ width: x.value }));

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View
        onLayout={onLayout}
        className="mt-5 w-full justify-center"
        style={{ height: THUMB + 16 }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Payment date"
        accessibilityValue={{ min, max, now: value, text: `in ${value} days` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "increment") onChange(Math.min(value + 1, max));
          if (e.nativeEvent.actionName === "decrement") onChange(Math.max(value - 1, min));
        }}
      >
        <View className="absolute h-1.5 rounded-full bg-line" style={{ left: THUMB / 2, right: THUMB / 2 }} />
        <Animated.View style={[{ position: "absolute", left: THUMB / 2, height: 6, borderRadius: 3, backgroundColor: colors.gold }, fill]} />
        <Animated.View
          style={[
            {
              position: "absolute",
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: colors.gold,
              borderWidth: 4,
              borderColor: colors.obsidian,
              shadowColor: colors.gold,
              shadowOpacity: 0.6,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 0 },
              elevation: 6,
            },
            thumb,
          ]}
        />
      </View>
    </GestureDetector>
  );
}

function Chip({ label, active, onPress, grow }: { label: string; active: boolean; onPress: () => void; grow?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`items-center rounded-full border px-4 py-2.5 ${grow ? "flex-1" : ""} ${active ? "border-gold bg-gold/15" : "border-line bg-abyss"}`}
    >
      <Text numberOfLines={1} className={`text-[13px] font-semibold ${active ? "text-gold" : "text-mute"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function DoneState({ date, amount, vendor }: { date: Date; amount: number; vendor: string }) {
  return (
    <View className="items-center py-8">
      <View className="h-16 w-16 items-center justify-center rounded-full border border-emerald/40 bg-emerald/15">
        <Text className="text-3xl text-emerald">✓</Text>
      </View>
      <Text className="mt-4 text-xl font-extrabold text-ink">Commitment logged</Text>
      <Text className="mt-2 text-center text-sm leading-5 text-mute">
        {formatINR(amount)} to {vendor} on {formatOrdinalDayMonth(date)}.{"\n"}Reminder calls are paused until then.
      </Text>
    </View>
  );
}

function buildQuickPicks(today: Date, maxDays: number) {
  const friday = (5 - today.getDay() + 7) % 7 || 7;
  const firstOfNext = daysBetween(today, new Date(today.getFullYear(), today.getMonth() + 1, 1));
  return [
    { label: "Tomorrow", offset: 1 },
    { label: "This Friday", offset: friday },
    { label: "In 7 days", offset: 7 },
    { label: "1st of next month", offset: firstOfNext },
    { label: "In 15 days", offset: 15 },
  ]
    .filter((q) => q.offset >= MIN_COMMIT_DAYS && q.offset <= maxDays)
    .filter((q, i, all) => all.findIndex((o) => o.offset === q.offset) === i);
}
