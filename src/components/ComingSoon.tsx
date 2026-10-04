import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/theme';

/** Placeholder for screens that are built in later iterations. */
export function ComingSoon({ title, icon }: { title: string; icon: ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.center}>
        <Ionicons name={icon} size={40} color={colors.primary} />
        <Text style={[typography.h2, styles.title]}>{title}</Text>
        <Text style={[typography.body, styles.subtitle]}>This screen is coming in the next build.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
  title: { color: colors.text },
  subtitle: { color: colors.textSecondary, textAlign: 'center' },
});
