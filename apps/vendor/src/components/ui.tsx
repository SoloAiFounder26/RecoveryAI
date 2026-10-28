import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { colors } from "@/theme/tokens";

export function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <View className="flex-row items-end justify-between">
      <Text className="text-[17px] font-extrabold text-ink">{title}</Text>
      {right ?? (sub ? <Text className="font-mono text-[10px] uppercase tracking-label text-faint">{sub}</Text> : null)}
    </View>
  );
}

export function Chip({ label, active, onPress, tone = colors.ink }: { label: string; active: boolean; onPress: () => void; tone?: string }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="rounded-full border px-4 py-2"
      style={{ borderColor: active ? tone : colors.line, backgroundColor: active ? `${tone}1F` : colors.surface }}
    >
      <Text className="text-[13px] font-semibold" style={{ color: active ? tone : colors.mute }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Large title block used at the top of each tab. */
export function ScreenTitle({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-1 pr-3">
        <Text className="font-mono text-[10px] uppercase tracking-label text-faint">{eyebrow}</Text>
        <Text numberOfLines={1} className="mt-1 text-[24px] font-extrabold text-ink">
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  tone = colors.emerald,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  tone?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      disabled={disabled || busy}
      accessibilityRole="button"
      className="h-14 items-center justify-center rounded-full active:opacity-80"
      style={{ backgroundColor: tone, opacity: disabled ? 0.4 : 1 }}
    >
      {busy ? <ActivityIndicator color={colors.obsidian} /> : <Text className="text-base font-extrabold text-obsidian">{label}</Text>}
    </Pressable>
  );
}

export function GhostButton({ label, onPress, tone = colors.ink, disabled }: { label: string; onPress: () => void; tone?: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      className="flex-1 items-center rounded-full border border-line bg-surface py-3 active:bg-raised"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Text className="text-[13px] font-semibold" style={{ color: tone }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View className="items-center rounded-3xl border border-line bg-surface p-8">
      <Text className="text-center text-[15px] font-bold text-ink">{title}</Text>
      {body ? <Text className="mt-1 text-center text-[13px] leading-5 text-mute">{body}</Text> : null}
    </View>
  );
}

export function Pill({ label, tone }: { label: string; tone: string }) {
  return (
    <View className="self-start rounded-full px-2 py-0.5" style={{ backgroundColor: `${tone}1A`, borderWidth: 1, borderColor: `${tone}40` }}>
      <Text className="font-mono text-[10px] uppercase tracking-label" style={{ color: tone }}>
        {label}
      </Text>
    </View>
  );
}

/** Full-screen loading / error gate for screens that need the vendor snapshot. */
export function DataGate({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-obsidian">
        <ActivityIndicator color={colors.mute} />
        <Text className="mt-3 font-mono text-[11px] uppercase tracking-label text-faint">Loading</Text>
      </View>
    );
  }
  return (
    <View className="flex-1 items-center justify-center bg-obsidian px-8">
      <Text className="text-center text-lg font-bold text-ink">Couldn't load your receivables</Text>
      <Text className="mt-2 text-center text-sm leading-5 text-mute">{error}</Text>
      <Pressable onPress={onRetry} className="mt-6 rounded-full bg-emerald px-6 py-3 active:opacity-80">
        <Text className="font-extrabold text-obsidian">Try again</Text>
      </Pressable>
    </View>
  );
}
