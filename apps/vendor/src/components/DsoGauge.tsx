import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedProps, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, Stop } from "react-native-svg";
import { MSME_PAYMENT_DAYS } from "@/lib/metrics";
import { colors } from "@/theme/tokens";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const SIZE = 140;
const STROKE = 11;
const R = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
const ARC = Math.PI * R; // length of the half circle
const MAX_DAYS = 120;

/** Point on the top semicircle for a 0..1 fraction (0 = left end, 1 = right end). */
function polar(f: number) {
  const a = Math.PI * (1 - f);
  return { x: CX + R * Math.cos(a), y: CY - R * Math.sin(a) };
}

const ARC_PATH = `M ${STROKE / 2} ${CY} A ${R} ${R} 0 0 1 ${SIZE - STROKE / 2} ${CY}`;

export function dsoTone(days: number | null) {
  if (days === null) return colors.mute;
  if (days <= MSME_PAYMENT_DAYS) return colors.emerald;
  if (days <= 75) return colors.gold;
  return colors.crimson;
}

interface Props {
  dso: number | null;
  avgDaysOverdue: number;
}

/**
 * Half-ring gauge for Days Sales Outstanding. The tick marks the 45-day MSMED Act payment
 * limit: left of it, buyers are paying inside the law; right of it, the vendor is owed interest.
 */
export function DsoGauge({ dso, avgDaysOverdue }: Props) {
  const progress = useSharedValue(0);
  const tone = dsoTone(dso);

  useEffect(() => {
    progress.value = withDelay(250, withSpring(Math.min((dso ?? 0) / MAX_DAYS, 1), { damping: 16, stiffness: 70 }));
  }, [dso, progress]);

  const arcProps = useAnimatedProps(() => ({ strokeDashoffset: ARC * (1 - progress.value) }));
  const target = polar(MSME_PAYMENT_DAYS / MAX_DAYS);

  return (
    <View className="items-center">
      <Svg width={SIZE} height={SIZE / 2 + STROKE} accessibilityLabel={`DSO ${dso ?? "not available"} days`}>
        <Defs>
          <SvgGradient id="dso" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.emerald} />
            <Stop offset="0.5" stopColor={colors.gold} />
            <Stop offset="1" stopColor={colors.crimson} />
          </SvgGradient>
        </Defs>
        <Path d={ARC_PATH} stroke={colors.raised} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
        <AnimatedPath
          d={ARC_PATH}
          stroke="url(#dso)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${ARC} ${ARC}`}
          animatedProps={arcProps}
        />
        <Circle cx={target.x} cy={target.y} r={3.5} fill={colors.ink} />
      </Svg>
      <View className="-mt-12 items-center">
        <Text className="text-[30px] font-extrabold" style={{ color: tone, fontVariant: ["tabular-nums"] }}>
          {dso ?? "—"}
        </Text>
        <Text className="-mt-1 font-mono text-[10px] uppercase tracking-label text-mute">days DSO</Text>
      </View>
      <View className="mt-3 flex-row items-center">
        <View className="mr-1.5 h-1.5 w-1.5 rounded-full bg-ink" />
        <Text className="font-mono text-[10px] text-faint">{MSME_PAYMENT_DAYS}D MSME LIMIT</Text>
      </View>
      <Text className="mt-1 font-mono text-[10px] text-faint">AVG {avgDaysOverdue}D PAST DUE</Text>
    </View>
  );
}
