import { Ionicons } from '@expo/vector-icons';
import type { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, shadow, spacing, typography } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TAB_META: Record<string, { label: string; icon: IconName; activeIcon: IconName }> = {
  home: { label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  customers: { label: 'Customers', icon: 'people-outline', activeIcon: 'people' },
  analytics: { label: 'Analytics', icon: 'bar-chart-outline', activeIcon: 'bar-chart' },
  more: { label: 'More', icon: 'menu-outline', activeIcon: 'menu' },
};

/** Bottom tab bar with the raised circular "AI" button in the middle. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (route.name === 'ai') {
          return (
            <Pressable key={route.key} onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityLabel="AI">
              <View style={[styles.aiButton, focused && styles.aiButtonFocused]}>
                <Ionicons name="sparkles" size={10} color="#FFFFFF" style={styles.aiSparkle} />
                <Text style={styles.aiText}>AI</Text>
              </View>
            </Pressable>
          );
        }

        const meta = TAB_META[route.name];
        if (!meta) return null;
        const tint = focused ? colors.primary : colors.textMuted;
        return (
          <Pressable key={route.key} onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: focused }}>
            <Ionicons name={focused ? meta.activeIcon : meta.icon} size={22} color={tint} />
            <Text style={[styles.label, { color: tint }, focused && { fontWeight: '700' }]}>{meta.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { ...typography.tiny, fontWeight: '500' },
  aiButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginTop: -26,
    backgroundColor: colors.primaryDark,
    borderWidth: 4,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.glow,
  },
  aiButtonFocused: { backgroundColor: colors.primary },
  aiSparkle: { position: 'absolute', top: 7, right: 7 },
  aiText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
});
