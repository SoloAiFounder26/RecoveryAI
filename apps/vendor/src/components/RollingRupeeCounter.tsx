import { memo, useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import { groupINR } from "@/lib/format";
import { colors } from "@/theme/tokens";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

interface Props {
  value: number;
  /** Glyph size. Line height and column width scale from it. */
  fontSize?: number;
  color?: string;
  /** Show •••• instead of the amount (privacy toggle). */
  masked?: boolean;
}

/**
 * Odometer-style rupee counter. Each digit is its own 0–9 column that springs to
 * its target on the UI thread, staggered right-to-left so the number "rolls in".
 * Columns are keyed by position from the right, so when the amount changes only
 * the digits that differ move (e.g. 2,84,750 -> 2,34,750 rolls only the 8).
 */
export function RollingRupeeCounter({ value, fontSize = 44, color = colors.ink, masked = false }: Props) {
  const lineHeight = Math.round(fontSize * 1.18);
  const chars = groupINR(Math.round(value)).split("");
  const glyph = { fontSize, lineHeight, height: lineHeight, color, fontWeight: "800" as const, fontVariant: ["tabular-nums" as const] };

  return (
    <View
      className="flex-row items-end"
      accessible
      accessibilityRole="text"
      accessibilityLabel={masked ? "Amount hidden" : `${groupINR(value)} rupees`}
    >
      <Text style={[glyph, { fontSize: fontSize * 0.62, color: colors.mute, marginRight: 4, fontWeight: "600" }]}>₹</Text>
      {masked ? (
        <Text style={[glyph, { letterSpacing: 4 }]}>••••••</Text>
      ) : (
        chars.map((ch, i) => {
          const fromRight = chars.length - 1 - i;
          return /\d/.test(ch) ? (
            <RollingDigit key={`d${fromRight}`} digit={Number(ch)} lineHeight={lineHeight} delay={fromRight * 45} glyph={glyph} />
          ) : (
            <Text key={`s${fromRight}`} style={[glyph, { color: colors.faint }]}>
              {ch}
            </Text>
          );
        })
      )}
    </View>
  );
}

interface DigitProps {
  digit: number;
  lineHeight: number;
  delay: number;
  glyph: object;
}

const RollingDigit = memo(function RollingDigit({ digit, lineHeight, delay, glyph }: DigitProps) {
  // Mount at 0 so the first render rolls up to the real value.
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withDelay(delay, withSpring(-digit * lineHeight, { damping: 17, stiffness: 140, mass: 0.9 }));
  }, [digit, lineHeight, delay, offset]);

  const strip = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <View style={{ height: lineHeight, overflow: "hidden" }}>
      <Animated.View style={strip}>
        {DIGITS.map((d) => (
          <Text key={d} style={glyph}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
});
