import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { GlassCard } from "@/components/GlassCard";
import { TAB_BAR_CLEARANCE } from "@/components/TabBar";
import { DataGate, Pill, PrimaryButton, ScreenTitle, SectionTitle } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { biometricLabel, getBiometricKind, type BiometricKind } from "@/lib/biometric";
import { formatDayMonth, groupINR } from "@/lib/format";
import { colors } from "@/theme/tokens";
import { PLANS } from "@/lib/plans";
import { PLAN_INVOICE_LIMIT, PLAN_PRICE, type Plan } from "@/types/vendor";

// What each tier unlocks, from the same plan table the web app enforces (lib/plans.ts).
function perksOf(p: Plan): string[] {
  const spec = PLANS[p];
  return [
    spec.invoicesPerMonth === null ? "Unlimited invoices" : `${spec.invoicesPerMonth} invoices / month`,
    spec.reminderCadence && "Day 1 / 16 / 31 reminder queue",
    spec.upiLinks && "UPI links in reminders",
    spec.allEmailTones && "All email tones",
    spec.bulkImport && "CSV / Excel bulk import",
    spec.statutoryNotices && "MSMED statutory notices",
    spec.agingDashboard && "Aging + interest dashboard",
    spec.seats > 1 && `${spec.seats} team seats`,
    spec.prioritySupport && "Priority support",
  ].filter((x): x is string => Boolean(x));
}

const MANAGE: { label: string; sub: string; href: "/profile" | "/team" | "/analytics" | "/import" | "/help" | "/activity" }[] = [
  { label: "Business profile", sub: "UPI ID, bank details, Udyam registration", href: "/profile" },
  { label: "Team", sub: "Invite your accountant or CA", href: "/team" },
  { label: "Analytics", sub: "Recovery trend, aging, MSMED interest", href: "/analytics" },
  { label: "Bulk import", sub: "Tally, Zoho Books or Excel export", href: "/import" },
  { label: "Activity log", sub: "Every reminder, call outcome and invoice", href: "/activity" },
  { label: "Help & support", sub: "Ask us anything, see replies", href: "/help" },
];

/** Admin: plan + live quotas, organisation, team, activity log and security status. */
export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { snapshot, metrics, error, loading, refresh, role } = useVendorData();
  const [kind, setKind] = useState<BiometricKind | null>(null);

  useEffect(() => {
    getBiometricKind().then(setKind).catch(() => {});
  }, []);

  if (!snapshot || !metrics || !snapshot.tenant) return <DataGate loading={loading} error={error} onRetry={refresh} />;

  const tenant = snapshot.tenant;
  const limit = PLAN_INVOICE_LIMIT[tenant.plan];
  const used = metrics.invoicesThisMonth;

  return (
    <View className="flex-1 bg-obsidian">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
        <ScreenTitle eyebrow="Account" title={tenant.business_name} />

        {/* Tier overview */}
        <GlassCard glow={colors.emerald} style={{ marginTop: 20 }} className="p-5">
          <View className="flex-row items-start justify-between">
            <View>
              <Text className="font-mono text-[10px] uppercase tracking-label text-mute">Current plan</Text>
              <Text className="mt-1 text-[26px] font-extrabold text-ink">{PLANS[tenant.plan].name}</Text>
            </View>
            <View className="items-end">
              <Text className="text-[22px] font-extrabold text-emerald">₹{groupINR(PLAN_PRICE[tenant.plan])}</Text>
              <Text className="font-mono text-[10px] text-faint">PER MONTH</Text>
            </View>
          </View>

          <QuotaGauge
            label="Invoices this month"
            used={used}
            limit={limit}
            caption={limit === null ? "Unlimited on MSME Growth" : `${Math.max(limit - used, 0)} left · resets 1st`}
          />
          <QuotaGauge label="WhatsApp reminders sent" used={metrics.whatsappRemindersThisMonth} limit={null} caption="This month · included in plan" />
          <QuotaGauge label="AI call outcomes logged" used={metrics.callOutcomesThisMonth} limit={null} caption="Call minutes aren't metered by the backend yet" />
        </GlassCard>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-3" contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
          {(["free", "pro", "growth"] as const).map((p) => {
            const current = p === tenant.plan;
            return (
              <View
                key={p}
                className="w-[170px] rounded-3xl border p-4"
                style={{ borderColor: current ? colors.emerald : colors.line, backgroundColor: current ? "rgba(0,229,153,0.06)" : colors.surface }}
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-[15px] font-extrabold text-ink">{PLANS[p].name}</Text>
                  {current && <Pill label="You" tone={colors.emerald} />}
                </View>
                <Text className="mt-1 text-[18px] font-extrabold text-ink">₹{groupINR(PLAN_PRICE[p])}</Text>
                {perksOf(p).map((perk) => (
                  <Text key={perk} className="mt-1.5 text-[11px] leading-4 text-mute">
                    · {perk}
                  </Text>
                ))}
              </View>
            );
          })}
        </ScrollView>
        <Text className="mt-2 text-[11px] text-faint">Plan changes and billing are handled on the RecoveryAI web dashboard.</Text>

        {/* Organisation */}
        <View className="mb-3 mt-8">
          <SectionTitle title="Organisation" />
        </View>
        <View className="overflow-hidden rounded-3xl border border-line bg-surface">
          <Row label="Business" value={tenant.business_name} />
          <Row label="Owner mobile" value={`+91 ${tenant.owner_phone}`} />
          <Row label="UPI ID" value={tenant.upi_id ?? "Not set"} />
          <Row label="Bank (NEFT)" value={tenant.bank_details ?? "Not set"} />
          <Row label="Udyam" value={tenant.udyam_number ? `${tenant.udyam_number}${tenant.udyam_category ? ` · ${tenant.udyam_category}` : ""}` : "Not registered"} />
          <Row label="Member since" value={formatDayMonth(new Date(tenant.created_at))} />
          <Row label="Switch business" value="Only one business on this login" muted last />
        </View>
        <Pressable onPress={() => router.push("/profile")} className="mt-2 self-end px-1 py-1">
          <Text className="text-[13px] font-bold text-gold">{role === "owner" ? "Edit profile ›" : "View profile ›"}</Text>
        </Pressable>

        {/* Team */}
        <View className="mb-3 mt-8">
          <SectionTitle
            title="Team"
            right={
              <Pressable onPress={() => router.push("/team")}>
                <Text className="font-mono text-[10px] uppercase tracking-label text-gold">
                  {snapshot.members.length + 1} / {PLANS[tenant.plan].seats} seats · manage ›
                </Text>
              </Pressable>
            }
          />
        </View>
        <View className="overflow-hidden rounded-3xl border border-line bg-surface">
          <MemberRow email={session?.user.email ?? "You"} role="Owner" tone={colors.emerald} last={snapshot.members.length === 0} />
          {snapshot.members.map((m, i) => (
            <MemberRow
              key={m.id}
              email={m.email}
              role={m.status === "invited" ? "Invited" : m.role === "viewer" ? "Viewer" : "Member"}
              tone={m.status === "invited" ? colors.gold : colors.ink}
              last={i === snapshot.members.length - 1}
            />
          ))}
        </View>

        {/* Everything else the web app's More menu has */}
        <View className="mb-3 mt-8">
          <SectionTitle title="Manage" />
        </View>
        <View className="overflow-hidden rounded-3xl border border-line bg-surface">
          {MANAGE.map((m, i) => (
            <Pressable
              key={m.href}
              onPress={() => router.push(m.href)}
              className={`flex-row items-center justify-between px-4 py-3.5 active:bg-raised ${i === MANAGE.length - 1 ? "" : "border-b border-line"}`}
            >
              <View className="flex-1 pr-3">
                <Text className="text-[14px] font-bold text-ink">{m.label}</Text>
                <Text className="mt-0.5 text-[12px] text-mute">{m.sub}</Text>
              </View>
              <Text className="text-[18px] text-mute">›</Text>
            </Pressable>
          ))}
        </View>

        {/* Security */}
        <View className="mb-3 mt-8">
          <SectionTitle title="Security" />
        </View>
        <View className="overflow-hidden rounded-3xl border border-line bg-surface">
          <Row label="App lock" value={kind ? `${biometricLabel(kind)} · every open` : "Device lock required"} good />
          <Row label="Screenshots" value="Blocked" good />
          <Row label="App switcher" value="Blurred" good />
          <Row label="Session" value="Device keychain" good />
          <Row label="Data access" value="Your business only (RLS)" good last />
        </View>

        <View className="mt-8">
          <PrimaryButton label="Sign out" tone={colors.crimson} onPress={signOut} />
        </View>
        <Text className="mt-4 text-center font-mono text-[10px] text-faint">
          RecoveryAI Business v{Constants.expoConfig?.version ?? "0.1.0"}
        </Text>
      </ScrollView>
    </View>
  );
}

function QuotaGauge({ label, used, limit, caption }: { label: string; used: number; limit: number | null; caption: string }) {
  const fill = useSharedValue(0);
  const ratio = limit ? Math.min(used / limit, 1) : 1;
  const tone = limit && ratio >= 1 ? colors.crimson : limit && ratio >= 0.8 ? colors.gold : colors.emerald;
  useEffect(() => {
    fill.value = withDelay(200, withSpring(ratio, { damping: 18, stiffness: 90 }));
  }, [fill, ratio]);
  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View className="mt-5">
      <View className="flex-row items-end justify-between">
        <Text className="font-mono text-[10px] uppercase tracking-label text-mute">{label}</Text>
        <Text className="text-[14px] font-bold text-ink">
          {used}
          {limit !== null ? <Text className="text-mute"> / {limit}</Text> : null}
        </Text>
      </View>
      <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
        <Animated.View style={[{ height: "100%", borderRadius: 999, backgroundColor: tone, opacity: limit === null ? 0.35 : 1 }, bar]} />
      </View>
      <Text className="mt-1 text-[11px] text-faint">{caption}</Text>
    </View>
  );
}

function Row({ label, value, last, muted, good }: { label: string; value: string; last?: boolean; muted?: boolean; good?: boolean }) {
  return (
    <View className={`flex-row items-center justify-between px-4 py-3.5 ${last ? "" : "border-b border-line"}`}>
      <Text className="text-[13px] text-mute">{label}</Text>
      <View className="ml-4 flex-1 flex-row items-center justify-end">
        {good && <View className="mr-2 h-1.5 w-1.5 rounded-full bg-emerald" />}
        <Text numberOfLines={1} className="text-right text-[13px] font-semibold" style={{ color: muted ? colors.faint : colors.ink }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function MemberRow({ email, role, tone, last }: { email: string; role: string; tone: string; last: boolean }) {
  return (
    <View className={`flex-row items-center px-4 py-3.5 ${last ? "" : "border-b border-line"}`}>
      <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-raised">
        <Text className="text-[12px] font-extrabold text-ink">{email[0]?.toUpperCase()}</Text>
      </View>
      <Text numberOfLines={1} className="flex-1 text-[13px] text-ink">
        {email}
      </Text>
      <Pill label={role} tone={tone} />
    </View>
  );
}
