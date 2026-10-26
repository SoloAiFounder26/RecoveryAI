import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { formatINR } from "@/lib/format";
import { colors, monoFont } from "@/theme/tokens";

const TRACK_HEIGHT = 72;
const PADDING = 6;
const KNOB = TRACK_HEIGHT - PADDING * 2;
const COMPLETE_AT = 0.86; // fraction of travel that counts as "swiped"
const SPRING = { damping: 20, stiffness: 220, mass: 0.8 };
// Most UPI apps cap a single payment at ₹1,00,000. Above that we hand off to NetBanking.
const DEFAULT_UPI_LIMIT = 100_000;
const VPA_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export type SwipeToPayOutcome = "upi_launched" | "no_upi_app" | "over_upi_limit" | "invalid_payee";

interface Props {
  amount: number;
  /** Vendor's UPI ID (tenants.upi_id). */
  payeeVpa: string | null;
  payeeName: string;
  /** Shown in the debtor's UPI app and bank statement, e.g. "GKE/24-25/0187". */
  note: string;
  /** Optional merchant reference for reconciliation. Only send for merchant VPAs. */
  transactionRef?: string;
  upiLimit?: number;
  disabled?: boolean;
  /** Called once the swipe locks, with what happened. */
  onSwipeComplete?: (outcome: SwipeToPayOutcome) => void;
  /**
   * Called when the debtor comes back from the UPI app. The UPI intent gives no
   * reliable result to JS, so the caller should poll the backend / webhook for
   * the payment rather than trust the client.
   */
  onReturnFromUpi?: () => void;
}

export function buildUpiUrl(p: { vpa: string; name: string; amount: number; note: string; ref?: string }) {
  const q = [
    ["pa", p.vpa],
    ["pn", p.name],
    ["am", p.amount.toFixed(2)],
    ["cu", "INR"],
    ["tn", p.note.slice(0, 80)],
    ...(p.ref ? [["tr", p.ref]] : []),
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `upi://pay?${q}`;
}

/**
 * CRED-style "swipe to pay". The knob tracks the finger on the UI thread, ticks
 * a light haptic every quarter of travel, and locks with a heavy haptic + spring
 * once past 86%. Releasing early springs it home. On lock it opens the UPI
 * intent (any installed UPI app picks it up on Android; iOS needs a UPI app that
 * registers `upi://`).
 */
export function SwipeToPaySlider({
  amount,
  payeeVpa,
  payeeName,
  note,
  transactionRef,
  upiLimit = DEFAULT_UPI_LIMIT,
  disabled = false,
  onSwipeComplete,
  onReturnFromUpi,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [phase, setPhase] = useState<"idle" | "locked" | "waiting">("idle");
  const awaitingReturn = useRef(false);

  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const maxX = useSharedValue(0);
  const lastTick = useSharedValue(0);
  const locked = useSharedValue(false);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 0 })), -1);
  }, [shimmer]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackWidth(w);
    maxX.value = Math.max(0, w - KNOB - PADDING * 2);
  };

  const reset = useCallback(() => {
    locked.value = false;
    lastTick.value = 0;
    x.value = withSpring(0, SPRING);
    setPhase("idle");
  }, [locked, lastTick, x]);

  // When the debtor returns from their UPI app, release the lock and let the caller verify.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && awaitingReturn.current) {
        awaitingReturn.current = false;
        onReturnFromUpi?.();
        setTimeout(reset, 600);
      }
    });
    return () => sub.remove();
  }, [onReturnFromUpi, reset]);

  const tick = () => Haptics.selectionAsync();

  const handleComplete = useCallback(async () => {
    setPhase("locked");
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const finish = (outcome: SwipeToPayOutcome) => {
      onSwipeComplete?.(outcome);
      if (outcome !== "upi_launched") setTimeout(reset, 900);
    };

    if (!payeeVpa || !VPA_PATTERN.test(payeeVpa)) return finish("invalid_payee");
    if (amount > upiLimit) return finish("over_upi_limit");

    const url = buildUpiUrl({ vpa: payeeVpa, name: payeeName, amount, note, ref: transactionRef });
    try {
      // canOpenURL is unreliable for upi:// on Android 11+ without <queries>, so just try it.
      await Linking.openURL(url);
      awaitingReturn.current = true;
      setPhase("waiting");
      finish("upi_launched");
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      finish("no_upi_app");
    }
  }, [amount, note, onSwipeComplete, payeeName, payeeVpa, reset, transactionRef, upiLimit]);

  const pan = Gesture.Pan()
    .enabled(!disabled && phase === "idle")
    .activeOffsetX([-4, 4])
    .onBegin(() => {
      start.value = x.value;
    })
    .onUpdate((e) => {
      if (locked.value) return;
      const next = Math.min(Math.max(start.value + e.translationX, 0), maxX.value);
      x.value = next;
      const quarter = maxX.value > 0 ? Math.floor((next / maxX.value) * 4) : 0;
      if (quarter !== lastTick.value) {
        lastTick.value = quarter;
        scheduleOnRN(tick);
      }
    })
    .onEnd(() => {
      if (locked.value) return;
      if (maxX.value > 0 && x.value >= maxX.value * COMPLETE_AT) {
        locked.value = true;
        x.value = withSpring(maxX.value, SPRING);
        scheduleOnRN(handleComplete);
      } else {
        x.value = withSpring(0, SPRING);
        lastTick.value = 0;
      }
    });

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  const fillStyle = useAnimatedStyle(() => ({
    width: x.value + KNOB,
    opacity: interpolate(x.value, [0, Math.max(maxX.value, 1)], [0.35, 1], Extrapolation.CLAMP),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, Math.max(maxX.value, 1) * 0.5], [1, 0], Extrapolation.CLAMP),
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-120, trackWidth + 40]) }],
  }));

  const label =
    phase === "waiting" ? "Complete payment in your UPI app" : phase === "locked" ? "Opening UPI…" : `Swipe to pay ${formatINR(amount)}`;

  return (
    <View style={{ opacity: disabled ? 0.45 : 1 }}>
      <View
        onLayout={onLayout}
        className="overflow-hidden rounded-full border border-line bg-abyss"
        style={{ height: TRACK_HEIGHT, padding: PADDING, justifyContent: "center" }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Swipe right to pay ${formatINR(amount)} to ${payeeName} by UPI`}
        accessibilityActions={[{ name: "activate", label: "Pay now" }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === "activate" && phase === "idle" && !disabled && handleComplete()}
      >
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", left: PADDING, top: PADDING, bottom: PADDING, borderRadius: KNOB / 2, overflow: "hidden" }, fillStyle]}
        >
          <LinearGradient
            colors={["rgba(0,229,153,0.05)", "rgba(0,229,153,0.32)"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: KNOB + PADDING * 3, right: 20, overflow: "hidden" }, labelStyle]}>
          <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: monoFont, fontSize: 13, letterSpacing: 1.4, textTransform: "uppercase" }}>
            {label}
          </Text>
          {phase === "idle" && (
            <Animated.View style={[{ position: "absolute", top: -10, bottom: -10, width: 60 }, shimmerStyle]}>
              <LinearGradient
                colors={["rgba(14,14,18,0)", "rgba(14,14,18,0.85)", "rgba(14,14,18,0)"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          )}
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View
            hitSlop={12}
            style={[
              {
                width: KNOB,
                height: KNOB,
                borderRadius: KNOB / 2,
                backgroundColor: colors.emerald,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: colors.emerald,
                shadowOpacity: 0.55,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 0 },
                elevation: 8,
              },
              Platform.OS === "web" && ({ cursor: "grab", touchAction: "none" } as object),
              knobStyle,
            ]}
          >
            {phase === "idle" ? <ChevronsRight /> : <Check />}
          </Animated.View>
        </GestureDetector>
      </View>
      <Text className="mt-2 text-center font-mono text-[10px] tracking-label text-faint">
        UPI · {payeeVpa ?? "payee not set"} · secured by your bank
      </Text>
    </View>
  );
}

function ChevronsRight() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l6 6-6 6M13 6l6 6-6 6" stroke={colors.obsidian} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Check() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={colors.obsidian} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
