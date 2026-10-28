import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { BackIcon } from "@/components/icons";
import { colors } from "@/theme/tokens";

export function BackHeader({ eyebrow, title, close }: { eyebrow: string; title: string; close?: boolean }) {
  const router = useRouter();
  return (
    <View className="flex-row items-center">
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={close ? "Close" : "Back"}
        className="mr-3 h-10 w-10 items-center justify-center rounded-full border border-line bg-surface"
      >
        {close ? <Text className="text-[15px] text-ink">✕</Text> : <BackIcon color={colors.ink} />}
      </Pressable>
      <View className="flex-1">
        <Text className="font-mono text-[10px] uppercase tracking-label text-faint">{eyebrow}</Text>
        <Text numberOfLines={1} className="text-[20px] font-extrabold text-ink">
          {title}
        </Text>
      </View>
    </View>
  );
}
