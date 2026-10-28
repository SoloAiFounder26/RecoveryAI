import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { metallicBorder } from "@/theme/tokens";

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Accent glow bleeding in from the top-left corner (e.g. emerald for "collected"). */
  glow?: string;
  className?: string;
}

/**
 * Frosted card: a real backdrop blur on iOS, a translucent charcoal pane on Android (where
 * per-card native blur is too costly for a scrolling list), both edged with the 1px metallic hairline.
 */
export function GlassCard({ children, style, glow, className }: Props) {
  return (
    <LinearGradient colors={metallicBorder} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: 24, padding: 1 }, style]}>
      <View style={{ flexGrow: 1, borderRadius: 23, overflow: "hidden", backgroundColor: Platform.OS === "ios" ? "rgba(22,22,31,0.55)" : "rgba(22,22,31,0.92)" }}>
        {Platform.OS === "ios" && <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />}
        {glow && (
          <LinearGradient
            colors={[`${glow}26`, `${glow}00`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.8, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        <View className={className} style={{ flexGrow: 1 }}>
          {children}
        </View>
      </View>
    </LinearGradient>
  );
}
