import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, radius, RiskLevel, riskColors, shadow, spacing, typography } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function RiskBadge({ level, label }: { level: RiskLevel; label?: string }) {
  const c = riskColors[level];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label ?? c.label}</Text>
    </View>
  );
}

/** Small pill used on dark surfaces, e.g. "High Priority" on the hero card. */
export function Pill({ label, icon, color = colors.high }: { label: string; icon?: IconName; color?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}26`, borderColor: `${color}66` }]}>
      {icon ? <Ionicons name={icon} size={10} color={color} /> : null}
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function IconTile({
  name,
  color = colors.primary,
  background = colors.primarySoft,
  size = 36,
}: {
  name: IconName;
  color?: string;
  background?: string;
  size?: number;
}) {
  return (
    <View style={[styles.iconTile, { width: size, height: size, borderRadius: size * 0.3, backgroundColor: background }]}>
      <Ionicons name={name} size={size * 0.5} color={color} />
    </View>
  );
}

type ButtonVariant = 'primary' | 'outline' | 'muted';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  size = 'md',
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        buttonSizes[size],
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={size === 'lg' ? 18 : 14} color={v.fg} /> : null}
      <Text style={[size === 'lg' ? typography.h3 : typography.captionStrong, { color: v.fg }]}>{label}</Text>
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: '#FFFFFF', border: colors.primary },
  outline: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  muted: { bg: '#F1F4F2', fg: colors.textSecondary, border: '#F1F4F2' },
};

const buttonSizes: Record<'sm' | 'md' | 'lg', ViewStyle> = {
  sm: { paddingHorizontal: spacing.md, height: 32 },
  md: { paddingHorizontal: spacing.lg, height: 38 },
  lg: { paddingHorizontal: spacing.xl, height: 52, borderRadius: radius.lg },
};

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={[typography.h3, { color: colors.text }]}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} style={styles.sectionAction} hitSlop={8}>
          <Text style={[typography.caption, { color: colors.textSecondary }]}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={12} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { ...typography.tiny },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pillText: { ...typography.tiny },
  iconTile: { alignItems: 'center', justifyContent: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
