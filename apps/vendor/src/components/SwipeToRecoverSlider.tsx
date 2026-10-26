import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";
import { colors, monoFont } from "@/theme/tokens";

const TRACK_HEIGHT = 60;
const PADDING = 5;
const KNOB = TRACK_HEIGHT - PADDING * 2;
const COMPLETE_AT = 0.85; // fraction of travel that counts as "swiped"
const SPRING = { damping: 20, stiffness: 240, mass: 0.75 };
const RESET_AFTER_MS = 2400;

export interface SwipeTriggerResult {
  ok: boolean;
  /** Shown in the track after the swipe, e.g. "AI call queued" or "Dialer not connected". */
  message: string;
}

interface Props {
  /** Idle copy, e.g. "Swipe to call Shree Balaji". */
  label: string;
  /** Runs once the knob locks. Resolve, don't throw: the result decides the end state. */
  onTrigger: () => Promise<SwipeTriggerResult>;
  disabled?: boolean;
  /** Short reason shown instead of the label when disabled, e.g. "AI paused · promise on 5 Nov". */
  disabledLabel?: string;
  accent?: string;
}

type Phase = "idle" | "working" | "done" | "failed";

/**
 * CRED-style "swipe to trigger AI recovery call". The knob tracks the finger on the UI
 * thread (Reanimated + Gesture Handler), ticks a selection haptic at each quarter, and
 * past 85% snaps home with a heavy impact and fires `onTrigger`. Released early, it
 * springs back. A failed trigger shakes the knob and resets; a success holds the check
 * for a moment so the vendor sees it land.
 */
export function SwipeToRecoverSlider({ label, onTrigger, disabled = false, disabledLabel, accent = colors.gold }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const maxX = useSharedValue(0);
  const lastTick = useSharedValue(0);
  const locked = useSharedValue(false);
  const shimmer = useSharedValue(0);
  const shake = useSharedValue(0);
  const failGlow = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withSequence(withTiming(1, { duration: 1600 }), withTiming(0, { duration: 0 })), -1);
    return () => {
      mounted.current = false;
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, [shimmer]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setTrackWidth(w);
    maxX.value = Math.max(0, w - KNOB - PADDING * 2);
  };

  const reset = useCallback(() => {
    if (!mounted.current) return;
    locked.value = false;
    lastTick.value = 0;
    failGlow.value = withTiming(0, { duration: 300 });
    x.value = withSpring(0, SPRING);
    setPhase("idle");
    setMessage("");
  }, [failGlow, lastTick, locked, x]);

  const tick = () => Haptics.selectionAsync();
  const grab = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  const fire = useCallback(async () => {
    setPhase("working");
    // The "snap": a heavy thud the moment the knob locks, before any network wait.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    let result: SwipeTriggerResult;
    try {
      result = await onTrigger();
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message : "Couldn't start the call" };
    }
    if (!mounted.current) return;

    setMessage(result.message);
    if (result.ok) {
      setPhase("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setPhase("failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      failGlow.value = withTiming(1, { duration: 160 });
      shake.value = withSequence(
        withTiming(-8, { duration: 45 }),
        withTiming(8, { duration: 45 }),
        withTiming(-5, { duration: 45 }),
        withTiming(0, { duration: 45 }),
      );
    }
    resetTimer.current = setTimeout(reset, RESET_AFTER_MS);
  }, [failGlow, onTrigger, reset, shake]);

  const pan = Gesture.Pan()
    .enabled(!disabled && phase === "idle")
    .activeOffsetX([-4, 4])
    .failOffsetY([-14, 14]) // let the list scroll when the drag is mostly vertical
    .onBegin(() => {
      start.value = x.value;
      scheduleOnRN(grab);
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
    .onFinalize(() => {
      if (locked.value) return;
      if (maxX.value > 0 && x.value >= maxX.value * COMPLETE_AT) {
        locked.value = true;
        x.value = withSpring(maxX.value, { ...SPRING, stiffness: 420 });
        scheduleOnRN(fire);
      } else {
        x.value = withSpring(0, SPRING);
        lastTick.value = 0;
      }
    });

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value + shake.value }, { scale: interpolate(x.value, [0, Math.max(maxX.value, 1)], [1, 1.04], Extrapolation.CLAMP) }],
    backgroundColor: interpolateColor(failGlow.value, [0, 1], [accent, colors.crimson]),
    shadowColor: interpolateColor(failGlow.value, [0, 1], [accent, colors.crimson]),
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: x.value + KNOB,
    opacity: interpolate(x.value, [0, Math.max(maxX.value, 1)], [0.3, 1], Extrapolation.CLAMP),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, Math.max(maxX.value, 1) * 0.45], [1, 0], Extrapolation.CLAMP),
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-120, trackWidth + 40]) }],
  }));

  const statusText = phase === "working" ? "Dialling AI agent…" : message;
  const idleText = disabled && disabledLabel ? disabledLabel : label;

  return (
    <View style={{ opacity: disabled ? 0.45 : 1 }}>
      <View
        onLayout={onLayout}
        className="overflow-hidden rounded-full border border-line bg-obsidian"
        style={{ height: TRACK_HEIGHT, padding: PADDING, justifyContent: "center" }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={idleText}
        accessibilityHint="Swipe right to start an AI recovery call"
        accessibilityState={{ disabled, busy: phase === "working" }}
        accessibilityActions={[{ name: "activate", label: "Start AI call" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "activate" && phase === "idle" && !disabled) {
            locked.value = true;
            x.value = withSpring(maxX.value, SPRING);
            fire();
          }
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[{ position: "absolute", left: PADDING, top: PADDING, bottom: PADDING, borderRadius: KNOB / 2, overflow: "hidden" }, fillStyle]}
        >
          <LinearGradient
            colors={phase === "failed" ? ["rgba(255,51,102,0.05)", "rgba(255,51,102,0.35)"] : [`${accent}0D`, `${accent}55`]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        {phase === "idle" ? (
          <Animated.View pointerEvents="none" style={[{ position: "absolute", left: KNOB + PADDING * 3, right: 18, overflow: "hidden" }, labelStyle]}>
            <Text numberOfLines={1} style={{ color: colors.ink, fontFamily: monoFont, fontSize: 12, letterSpacing: 1.3, textTransform: "uppercase" }}>
              {idleText}
            </Text>
            {!disabled && (
              <Animated.View style={[{ position: "absolute", top: -10, bottom: -10, width: 60 }, shimmerStyle]}>
                <LinearGradient
                  colors={["rgba(8,8,10,0)", "rgba(8,8,10,0.85)", "rgba(8,8,10,0)"]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ flex: 1 }}
                />
              </Animated.View>
            )}
          </Animated.View>
        ) : (
          <View pointerEvents="none" style={{ position: "absolute", left: 22, right: KNOB + PADDING * 3 }} accessibilityLiveRegion="polite">
            <Text
              numberOfLines={1}
              style={{
                color: phase === "failed" ? colors.crimson : colors.ink,
                fontFamily: monoFont,
                fontSize: 12,
                letterSpacing: 1.3,
                textTransform: "uppercase",
              }}
            >
              {statusText}
            </Text>
          </View>
        )}

        <GestureDetector gesture={pan}>
          <Animated.View
            hitSlop={12}
            style={[
              {
                width: KNOB,
                height: KNOB,
                borderRadius: KNOB / 2,
                alignItems: "center",
                justifyContent: "center",
                shadowOpacity: 0.55,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 0 },
                elevation: 8,
              },
              Platform.OS === "web" && ({ cursor: "grab", touchAction: "none" } as object),
              knobStyle,
            ]}
          >
            {phase === "working" ? (
              <ActivityIndicator color={colors.obsidian} />
            ) : phase === "done" ? (
              <Check />
            ) : phase === "failed" ? (
              <Cross />
            ) : (
              <PhoneArrow />
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

function PhoneArrow() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 4.5h3l1.5 4-2 1.2a10 10 0 0 0 4.8 4.8l1.2-2 4 1.5v3a1.5 1.5 0 0 1-1.6 1.5A15 15 0 0 1 3.5 6.1 1.5 1.5 0 0 1 5 4.5Z"
        stroke={colors.obsidian}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M15 3.5l3 3-3 3M18 6.5h-5" stroke={colors.obsidian} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Check() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={colors.obsidian} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Cross() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={colors.obsidian} strokeWidth={2.8} strokeLinecap="round" />
    </Svg>
  );
}
