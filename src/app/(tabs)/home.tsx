import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, IconTile, Pill, RiskBadge, SectionHeader } from '@/components/ui';
import { currentUser, dashboard, PriorityAction, PriorityCustomer, priorityCustomers } from '@/data/mock';
import { colors, radius, riskColors, spacing, typography } from '@/theme';
import { formatINR, greetingForHour } from '@/utils/format';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function HomeScreen() {
  const { opportunity, stats } = dashboard;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Header />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.greeting}>
          {greetingForHour(new Date().getHours())}, {currentUser.firstName}! 👋
        </Text>
        <Text style={styles.greetingSub}>Here's your recovery summary for today.</Text>

        <LinearGradient colors={[colors.heroStart, colors.heroEnd]} style={styles.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.heroTop}>
            <Text style={styles.heroLabel}>Today's Recovery Opportunity</Text>
            <Pill label="High Priority" icon="flame" color="#F87171" />
          </View>
          <Text style={styles.heroAmount}>{formatINR(opportunity.amount)}</Text>
          <Text style={styles.heroSub}>{opportunity.customersNeedingAttention} customers need your attention</Text>
        </LinearGradient>

        <View style={styles.statGrid}>
          <StatCard icon="wallet-outline" label="Total Outstanding" value={formatINR(stats.totalOutstanding)} />
          <StatCard
            icon="alert-circle-outline"
            iconColor={colors.high}
            iconBg={colors.highSoft}
            label="Overdue Amount"
            value={formatINR(stats.overdueAmount)}
          />
          <StatCard icon="cash-outline" label="Recovered (Month)" value={formatINR(stats.recoveredThisMonth)} />
          <StatCard icon="stats-chart-outline" label="Recovery Rate" value={`${stats.recoveryRate}%`} />
        </View>

        <SectionHeader title="Today's Priority" actionLabel="See All" onAction={() => router.push('/ai')} />
        <Card>
          {priorityCustomers.map((c, i) => (
            <PriorityRow key={c.id} customer={c} last={i === priorityCustomers.length - 1} />
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Pressable hitSlop={8} onPress={() => router.push('/more')}>
        <Ionicons name="menu" size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.brand}>
        Recover<Text style={{ color: colors.primary }}>AI</Text>
      </Text>
      <View style={styles.headerRight}>
        <View>
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
          <View style={styles.notifDot} />
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{currentUser.initials}</Text>
        </View>
      </View>
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
  iconColor = colors.primary,
  iconBg = colors.primarySoft,
}: {
  icon: IconName;
  label: string;
  value: string;
  iconColor?: string;
  iconBg?: string;
}) {
  return (
    <Card style={styles.statCard}>
      <IconTile name={icon} color={iconColor} background={iconBg} size={34} />
      <View style={{ flex: 1 }}>
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.statValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Card>
  );
}

const ACTIONS: Record<PriorityAction, { label: string; variant: 'primary' | 'outline' | 'muted'; icon?: IconName }> = {
  call: { label: 'Call Now', variant: 'primary', icon: 'call' },
  whatsapp: { label: 'WhatsApp', variant: 'primary', icon: 'logo-whatsapp' },
  followup: { label: 'Follow-up', variant: 'outline' },
  dontChase: { label: "Don't Chase", variant: 'muted' },
};

const RISK_ICONS: Record<PriorityCustomer['risk'], IconName> = {
  high: 'flame',
  medium: 'person',
  low: 'leaf',
};

function PriorityRow({ customer, last }: { customer: PriorityCustomer; last: boolean }) {
  const risk = riskColors[customer.risk];
  const action = ACTIONS[customer.action];
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/customer/[id]', params: { id: customer.id } })}
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { backgroundColor: colors.primaryTint }]}
    >
      <IconTile name={RISK_ICONS[customer.risk]} color={risk.fg} background={risk.bg} size={38} />
      <View style={styles.rowBody}>
        <View style={styles.rowTitle}>
          <Text style={styles.rowName} numberOfLines={1}>
            {customer.name}
          </Text>
          <RiskBadge level={customer.risk} />
        </View>
        <Text style={styles.rowMeta}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>{formatINR(customer.outstanding)}</Text>
          {'  ·  '}
          {customer.daysOverdue} days overdue
        </Text>
        <View style={styles.chanceRow}>
          <Ionicons name="arrow-up" size={11} color={colors.primary} />
          <Text style={styles.chance}>{customer.recoveryChance}% chance</Text>
        </View>
      </View>
      <View style={styles.rowAside}>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        <Button
          label={action.label}
          icon={action.icon}
          variant={action.variant}
          size="sm"
          onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: customer.id } })}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.lg,
    backgroundColor: colors.surface,
  },
  brand: { ...typography.h2, color: colors.text, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  notifDot: {
    position: 'absolute',
    top: 1,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  greeting: { ...typography.h2, color: colors.text },
  greetingSub: { ...typography.body, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.lg },

  hero: { borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroLabel: { ...typography.captionStrong, color: colors.textOnDarkMuted },
  heroAmount: { ...typography.amountXL, color: colors.textOnDark, marginTop: spacing.sm },
  heroSub: { ...typography.caption, color: colors.textOnDarkMuted, marginTop: spacing.xs },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  statLabel: { ...typography.caption, fontSize: 11, color: colors.textSecondary },
  statValue: { ...typography.amount, fontSize: 16, color: colors.text, marginTop: 2 },

  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowName: { ...typography.bodyStrong, color: colors.text, flexShrink: 1 },
  rowMeta: { ...typography.caption, color: colors.textSecondary },
  chanceRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  chance: { ...typography.captionStrong, color: colors.primary },
  rowAside: { alignItems: 'flex-end', gap: spacing.sm },
});
