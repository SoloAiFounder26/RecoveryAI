import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInRight, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { usePortalData } from "@/hooks/usePortalData";
import { daysBetween, formatDayMonth, formatINR, formatINRCompact, parseISODate, startOfToday } from "@/lib/format";
import { colors, metallicBorder } from "@/theme/tokens";
import type { PortalCommitment, PortalInvoice } from "@/types/portal";
import { CommitmentDatePickerSheet, type CommitmentDatePickerSheetRef } from "./CommitmentDatePickerSheet";
import { RollingRupeeCounter } from "./RollingRupeeCounter";
import { SwipeToPaySlider, type SwipeToPayOutcome } from "./SwipeToPaySlider";

type LedgerFilter = "pending" | "cleared";

interface Props {
  onOpenInvoice?: (invoice: PortalInvoice) => void;
}

/**
 * Customer Vault: the debtor's home screen. Hero rolling total, status badges,
 * swipe-to-pay for the selected vendor, a "commit a date" sheet, three CRED-style
 * horizontal rails, and the invoice ledger.
 */
export function CustomerDashboard({ onOpenInvoice }: Props) {
  const insets = useSafeAreaInsets();
  const data = usePortalData();
  const auth = useAuth();
  const sheet = useRef<CommitmentDatePickerSheetRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [masked, setMasked] = useState(false);
  const [filter, setFilter] = useState<LedgerFilter>("pending");

  const vendorById = useMemo(() => new Map(data.accounts.map((a) => [a.customer_id, a.vendor_name])), [data.accounts]);
  const selected = data.accounts.find((a) => a.customer_id === selectedId) ?? data.accounts[0] ?? null;
  const worstOverdue = Math.max(0, ...data.accounts.map((a) => a.overdue_days));
  const nextPromise = data.accounts
    .map((a) => a.active_promise_date)
    .filter((d): d is string => !!d)
    .sort()[0];
  const discount = data.accounts.find((a) => a.early_settlement_discount_pct && a.early_settlement_valid_until);

  const ledger = data.invoices.filter((i) => (filter === "pending" ? i.status !== "Paid" : i.status === "Paid"));
  const debtorName = data.accounts[0]?.customer_name ?? "";
  const openCount = data.invoices.filter((i) => i.status !== "Paid").length;

  const onSwipe = (outcome: SwipeToPayOutcome) => {
    if (outcome === "upi_launched") return;
    const msg: Record<Exclude<SwipeToPayOutcome, "upi_launched">, string> = {
      no_upi_app: "No UPI app was found on this phone. You can pay by NetBanking instead.",
      over_upi_limit: "This amount is above the usual UPI limit of ₹1,00,000. Please pay by NetBanking or commit a date for part payments.",
      invalid_payee: "This vendor hasn't set up a UPI ID yet. Please contact them or commit a payment date.",
    };
    Alert.alert("Pay another way", msg[outcome]);
  };

  return (
    <View className="flex-1 bg-obsidian">
      <LinearGradient colors={["#14141F", colors.obsidian]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: 420 }} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 48 }}
        refreshControl={<RefreshControl refreshing={data.loading} onRefresh={data.refresh} tintColor={colors.mute} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5">
          <View>
            <Text className="font-mono text-[11px] uppercase tracking-label text-faint">RecoveryAI · Vault</Text>
            <Text className="mt-1 text-lg font-bold text-ink">{debtorName || "Your account"}</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pill tone="emerald" label="Verified" />
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setMasked((m) => !m);
              }}
              accessibilityRole="button"
              accessibilityLabel={masked ? "Show amounts" : "Hide amounts"}
              className="h-9 w-9 items-center justify-center rounded-full border border-line bg-surface"
            >
              <Text className="text-base text-mute">{masked ? "◉" : "◎"}</Text>
            </Pressable>
            {!auth.isPreview && (
              <Pressable
                onPress={() => {
                  if (Platform.OS === "web") return auth.signOut();
                  Alert.alert("Sign out?", "You'll need a new code to sign in again.", [
                    { text: "Cancel", style: "cancel" },
                    { text: "Sign out", style: "destructive", onPress: auth.signOut },
                  ]);
                }}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                className="h-9 w-9 items-center justify-center rounded-full border border-line bg-surface"
              >
                <Text className="text-base text-mute">⏻</Text>
              </Pressable>
            )}
          </View>
        </View>

        {data.isMock && (
          <Text className="mx-5 mt-3 rounded-xl border border-line bg-surface px-3 py-2 font-mono text-[10px] text-faint">
            PREVIEW DATA · set EXPO_PUBLIC_SUPABASE_URL to load your real account
          </Text>
        )}
        {data.error && <Text className="mx-5 mt-3 text-sm text-crimson">{data.error}</Text>}

        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(500)} style={{ marginHorizontal: 20, marginTop: 20 }}>
          <MetallicCard>
            <Text className="font-mono text-[11px] uppercase tracking-label text-mute">Total pending amount</Text>
            <View className="mt-3">
              <RollingRupeeCounter value={data.totalPending} masked={masked} />
            </View>
            <Text className="mt-1 font-mono text-xs text-faint">
              across {data.accounts.length} {data.accounts.length === 1 ? "vendor" : "vendors"} · {openCount} open {openCount === 1 ? "invoice" : "invoices"}
            </Text>
            <View className="mt-4 flex-row flex-wrap gap-2">
              {worstOverdue > 0 && <Pill tone="crimson" label={`${worstOverdue} days overdue`} pulse />}
              {nextPromise && <Pill tone="gold" label={`Promise · ${formatDayMonth(nextPromise)}`} />}
              {discount && (
                <Pill
                  tone="emerald"
                  label={`${discount.early_settlement_discount_pct}% off if paid by ${formatDayMonth(discount.early_settlement_valid_until!)}`}
                />
              )}
              {worstOverdue === 0 && !nextPromise && data.totalPending > 0 && <Pill tone="emerald" label="On track" />}
            </View>
          </MetallicCard>
        </Animated.View>

        {/* Vendor selector (only when the debtor owes more than one business) */}
        {data.accounts.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }} className="mt-5">
            {data.accounts.map((a) => {
              const active = a.customer_id === selected?.customer_id;
              return (
                <Pressable
                  key={a.customer_id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedId(a.customer_id);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`rounded-2xl border px-4 py-3 ${active ? "border-ink/40 bg-raised" : "border-line bg-surface"}`}
                >
                  <Text className={`text-[13px] font-semibold ${active ? "text-ink" : "text-mute"}`}>{a.vendor_name}</Text>
                  <Text className="mt-0.5 font-mono text-[11px] text-faint">{masked ? "••••" : formatINR(a.total_outstanding)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Settle */}
        {selected && selected.total_outstanding > 0 && (
          <Animated.View entering={FadeInDown.delay(120).duration(500)} style={{ marginHorizontal: 20, marginTop: 20 }}>
            <SwipeToPaySlider
              amount={selected.total_outstanding}
              payeeVpa={selected.vendor_upi_id}
              payeeName={selected.vendor_name}
              note={`Settlement ${selected.customer_name}`.slice(0, 80)}
              onSwipeComplete={onSwipe}
              onReturnFromUpi={data.refresh}
            />
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                sheet.current?.present(selected);
              }}
              accessibilityRole="button"
              className="mt-3 h-14 flex-row items-center justify-center rounded-full border border-gold/40 bg-gold/10 active:opacity-80"
            >
              <Text className="text-[15px] font-bold text-gold">Pay later · commit a date</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Rails */}
        <Rail title="Upcoming commitments" empty="No promises scheduled">
          {data.upcomingCommitments.map((c, i) => (
            <CommitmentCard key={c.id} index={i} commitment={c} vendor={vendorById.get(c.customer_id)} masked={masked} />
          ))}
        </Rail>
        <Rail title="Active payment plans" empty="No instalment plans">
          {data.activePlans.map((c, i) => (
            <CommitmentCard key={c.id} index={i} commitment={c} vendor={vendorById.get(c.customer_id)} masked={masked} plan />
          ))}
        </Rail>
        <Rail title="Recently resolved" empty="Nothing settled yet">
          {data.recentlyResolved.map((inv, i) => (
            <ResolvedCard key={inv.id} index={i} invoice={inv} vendor={vendorById.get(inv.customer_id)} masked={masked} />
          ))}
        </Rail>

        {/* Ledger */}
        <View className="mt-8 flex-row items-center justify-between px-5">
          <Text className="font-mono text-[11px] uppercase tracking-label text-mute">Invoices & ledger</Text>
          <View className="flex-row rounded-full border border-line bg-surface p-1">
            {(["pending", "cleared"] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFilter(f);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: filter === f }}
                className={`rounded-full px-3 py-1.5 ${filter === f ? "bg-raised" : ""}`}
              >
                <Text className={`text-xs font-semibold capitalize ${filter === f ? "text-ink" : "text-faint"}`}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Animated.View layout={LinearTransition} style={{ marginTop: 12, gap: 12, paddingHorizontal: 20 }}>
          {ledger.length === 0 ? (
            <Text className="py-8 text-center text-sm text-faint">{filter === "pending" ? "You're all clear. Nothing pending." : "No cleared invoices yet."}</Text>
          ) : (
            ledger.map((inv, i) => (
              <InvoiceCard key={inv.id} index={i} invoice={inv} vendor={vendorById.get(inv.customer_id)} masked={masked} onPress={onOpenInvoice} />
            ))
          )}
        </Animated.View>
      </ScrollView>

      {/* Frosted status bar so content scrolls under it */}
      <BlurView intensity={40} tint="dark" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top }} />

      <CommitmentDatePickerSheet ref={sheet} onCommitted={() => data.refresh()} />
    </View>
  );
}

/* ---------- building blocks ---------- */

function MetallicCard({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  // 1px gradient "metal" edge: gradient wrapper + inset surface.
  return (
    <LinearGradient colors={metallicBorder} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 1 }}>
      <View className={`rounded-[23px] bg-surface ${padded ? "p-5" : ""}`}>{children}</View>
    </LinearGradient>
  );
}

const TONES = {
  emerald: { fg: colors.emerald, bg: "rgba(0,229,153,0.10)", border: "rgba(0,229,153,0.30)" },
  gold: { fg: colors.gold, bg: "rgba(255,184,0,0.10)", border: "rgba(255,184,0,0.30)" },
  crimson: { fg: colors.crimson, bg: "rgba(255,51,102,0.10)", border: "rgba(255,51,102,0.32)" },
  mute: { fg: colors.mute, bg: "rgba(138,138,158,0.08)", border: colors.line },
} as const;

function Pill({ label, tone, pulse }: { label: string; tone: keyof typeof TONES; pulse?: boolean }) {
  const t = TONES[tone];
  return (
    <View className="flex-row items-center rounded-full px-2.5 py-1" style={{ backgroundColor: t.bg, borderColor: t.border, borderWidth: 1 }}>
      {pulse && <View className="mr-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.fg }} />}
      <Text className="font-mono text-[10px] font-bold uppercase" style={{ color: t.fg, letterSpacing: 1 }}>
        {label}
      </Text>
    </View>
  );
}

function Rail({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <View className="mt-8">
      <View className="flex-row items-center justify-between px-5">
        <Text className="font-mono text-[11px] uppercase tracking-label text-mute">{title}</Text>
        <Text className="font-mono text-[11px] text-faint">{children.length}</Text>
      </View>
      {children.length === 0 ? (
        <View className="mx-5 mt-3 rounded-2xl border border-dashed border-line px-4 py-5">
          <Text className="text-center text-xs text-faint">{empty}</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={232}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingTop: 12 }}
        >
          {children}
        </ScrollView>
      )}
    </View>
  );
}

function CommitmentCard({
  commitment,
  vendor,
  masked,
  plan,
  index,
}: {
  commitment: PortalCommitment;
  vendor?: string;
  masked: boolean;
  plan?: boolean;
  index: number;
}) {
  const due = parseISODate(commitment.promised_date!);
  const inDays = daysBetween(startOfToday(), due);
  return (
    <Animated.View entering={FadeInRight.delay(index * 60).duration(400)} style={{ width: 220 }}>
      <MetallicCard>
        <View className="flex-row items-center justify-between">
          <Pill tone="gold" label={plan ? "Instalment" : "Promise"} />
          <Text className="font-mono text-[10px] text-faint">{inDays === 0 ? "TODAY" : inDays > 0 ? `IN ${inDays}D` : `${-inDays}D AGO`}</Text>
        </View>
        <Text className="mt-4 text-2xl font-extrabold text-ink">{masked ? "••••" : commitment.promised_amount == null ? "Full balance" : formatINRCompact(commitment.promised_amount)}</Text>
        <Text className="mt-1 text-sm font-semibold text-gold">on {formatDayMonth(due)}</Text>
        <Text numberOfLines={1} className="mt-3 text-xs text-mute">
          {vendor}
        </Text>
        <Text className="mt-1 font-mono text-[10px] text-faint">AI calls paused</Text>
      </MetallicCard>
    </Animated.View>
  );
}

function ResolvedCard({ invoice, vendor, masked, index }: { invoice: PortalInvoice; vendor?: string; masked: boolean; index: number }) {
  return (
    <Animated.View entering={FadeInRight.delay(index * 60).duration(400)} style={{ width: 220 }}>
      <MetallicCard>
        <View className="flex-row items-center justify-between">
          <Pill tone="emerald" label="Settled" />
          <Text className="text-emerald">✓</Text>
        </View>
        <Text className="mt-4 text-2xl font-extrabold text-ink">{masked ? "••••" : formatINRCompact(invoice.amount)}</Text>
        <Text numberOfLines={1} className="mt-1 font-mono text-[11px] text-mute">
          {invoice.invoice_no}
        </Text>
        <Text numberOfLines={1} className="mt-3 text-xs text-faint">
          {vendor}
        </Text>
      </MetallicCard>
    </Animated.View>
  );
}

function InvoiceCard({
  invoice,
  vendor,
  masked,
  onPress,
  index,
}: {
  invoice: PortalInvoice;
  vendor?: string;
  masked: boolean;
  onPress?: (i: PortalInvoice) => void;
  index: number;
}) {
  const due = parseISODate(invoice.due_date);
  const late = daysBetween(due, startOfToday());
  const paid = invoice.status === "Paid";
  const overdue = !paid && late > 0;
  const accent = paid ? colors.emerald : overdue ? colors.crimson : colors.gold;
  const statusLabel = paid ? "Paid" : overdue ? `${late}d overdue` : late === 0 ? "Due today" : `Due in ${-late}d`;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(400)}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onPress?.(invoice);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Invoice ${invoice.invoice_no}, ${formatINR(invoice.amount)}, ${statusLabel}`}
        className="flex-row overflow-hidden rounded-2xl border border-line bg-surface active:bg-raised"
      >
        <View style={{ width: 3, backgroundColor: accent }} />
        <View className="flex-1 flex-row items-center px-4 py-4">
          <View className="flex-1 pr-3">
            <Text numberOfLines={1} className="font-mono text-[12px] text-ink">
              {invoice.invoice_no}
            </Text>
            <Text numberOfLines={1} className="mt-1 text-xs text-mute">
              {vendor} · due {formatDayMonth(due)}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-base font-extrabold text-ink">{masked ? "••••" : formatINR(invoice.amount)}</Text>
            <Text className="mt-1 font-mono text-[10px] font-bold uppercase" style={{ color: accent, letterSpacing: 1 }}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

