import type { BottomTabBarProps } from "expo-router/js-tabs";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountIcon, DebtorsIcon, DispatchIcon, VaultIcon } from "@/components/icons";
import { colors } from "@/theme/tokens";

const ICONS = { index: VaultIcon, debtors: DebtorsIcon, dispatch: DispatchIcon, account: AccountIcon } as const;

/** Frosted floating tab bar. Light haptic on every switch. */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(insets.bottom, 12) }}>
      <View style={{ borderRadius: 28, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View
          style={{
            flexDirection: "row",
            paddingVertical: 8,
            paddingHorizontal: 6,
            backgroundColor: Platform.OS === "ios" ? "rgba(18,18,23,0.6)" : "rgba(18,18,23,0.96)",
          }}
        >
          {state.routes.map((route, i) => {
            const focused = state.index === i;
            const Icon = ICONS[route.name as keyof typeof ICONS] ?? VaultIcon;
            const title = descriptors[route.key].options.title ?? route.name;
            const tint = focused ? colors.ink : colors.faint;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={title}
                onPress={() => {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    navigation.navigate(route.name, route.params);
                  }
                }}
                style={{ flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 20, backgroundColor: focused ? colors.raised : "transparent" }}
              >
                <Icon color={tint} size={22} />
                <Text style={{ marginTop: 3, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, color: tint }}>{title}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** Space to leave under scrolling content so the floating bar doesn't cover it. */
export const TAB_BAR_CLEARANCE = 96;
