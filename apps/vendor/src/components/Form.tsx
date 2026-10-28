import { Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "@/theme/tokens";

export function Label({ children }: { children: string }) {
  return <Text className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-label text-mute">{children}</Text>;
}

export function Field({
  label,
  prefix,
  big,
  editable = true,
  multiline,
  ...input
}: TextInputProps & { label: string; prefix?: string; big?: boolean }) {
  return (
    <View>
      <Label>{label}</Label>
      <View
        className={`flex-row rounded-2xl border border-line bg-surface px-4 ${multiline ? "min-h-[96px] items-start py-3" : "h-14 items-center"}`}
        style={{ opacity: editable ? 1 : 0.6 }}
      >
        {prefix ? <Text className="mr-2 text-[16px] font-bold text-mute">{prefix}</Text> : null}
        <TextInput
          {...input}
          editable={editable}
          multiline={multiline}
          placeholderTextColor={colors.faint}
          style={{ flex: 1, color: colors.ink, fontSize: big ? 22 : 16, fontWeight: big ? "800" : "600", textAlignVertical: multiline ? "top" : "center" }}
        />
      </View>
    </View>
  );
}

/** Amber notice for plan locks and statutory caveats. */
export function Notice({ children, tone = colors.gold }: { children: string; tone?: string }) {
  return (
    <View className="mt-3 rounded-2xl border px-4 py-3" style={{ borderColor: `${tone}55`, backgroundColor: `${tone}12` }}>
      <Text className="text-[12px] leading-5" style={{ color: tone }}>
        {children}
      </Text>
    </View>
  );
}
