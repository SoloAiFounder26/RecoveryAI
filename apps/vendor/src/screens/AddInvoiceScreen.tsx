import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackHeader } from "@/components/BackHeader";
import { Field, Label } from "@/components/Form";
import { Chip, DataGate, PrimaryButton } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { addDays, formatWeekdayDayMonth, startOfToday, toISODate } from "@/lib/format";
import { colors } from "@/theme/tokens";
import { PLAN_INVOICE_LIMIT, PLAN_LABEL } from "@/types/vendor";

const CREDIT_TERMS = [7, 15, 30, 45, 60];

/** Add one invoice. An existing debtor is matched by mobile number, a new one is created. */
export function AddInvoiceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { snapshot, metrics, error: loadError, loading, refresh, addInvoice } = useVendorData();

  const [customerId, setCustomerId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [amount, setAmount] = useState("");
  const [raisedDaysAgo, setRaisedDaysAgo] = useState(0);
  const [terms, setTerms] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topDebtors = useMemo(() => (snapshot ? snapshot.customers.slice(0, 8) : []), [snapshot]);

  if (!snapshot || !metrics || !snapshot.tenant) return <DataGate loading={loading} error={loadError} onRetry={refresh} />;

  const limit = PLAN_INVOICE_LIMIT[snapshot.tenant.plan];
  const atLimit = limit !== null && metrics.invoicesThisMonth >= limit;
  const invoiceDate = addDays(startOfToday(), -raisedDaysAgo);
  const dueDate = addDays(invoiceDate, terms);
  const amountNum = Number(amount);
  const valid = name.trim().length > 0 && /^[6-9]\d{9}$/.test(phone) && invoiceNo.trim().length > 0 && amountNum > 0;

  const pick = (id: string | null) => {
    setCustomerId(id);
    const c = snapshot.customers.find((x) => x.id === id);
    setName(c?.name ?? "");
    setPhone(c?.phone ?? "");
    setEmail("");
    setCategory(c?.category ?? "");
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await addInvoice({
        name: name.trim(),
        phone,
        email: email.trim(),
        category: category.trim(),
        invoiceNo: invoiceNo.trim(),
        amount: amountNum,
        dueDate: toISODate(dueDate),
        invoiceDate: toISODate(invoiceDate),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-obsidian" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}
      >
        <BackHeader eyebrow="New receivable" title="Add invoice" close />

        <View className="mt-4 flex-row items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3">
          <Text className="text-[13px] text-mute">{PLAN_LABEL[snapshot.tenant.plan]} plan · this month</Text>
          <Text className="text-[13px] font-bold" style={{ color: atLimit ? colors.crimson : colors.ink }}>
            {metrics.invoicesThisMonth}
            {limit !== null ? ` / ${limit}` : ""} invoices
          </Text>
        </View>

        <Label>Debtor</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          <Chip label="+ New debtor" active={customerId === null} onPress={() => pick(null)} tone={colors.gold} />
          {topDebtors.map((c) => (
            <Chip key={c.id} label={c.name} active={customerId === c.id} onPress={() => pick(c.id)} />
          ))}
        </ScrollView>

        <Field label="Business name" value={name} onChangeText={setName} placeholder="Shree Balaji Traders" editable={customerId === null} />
        <Field
          label="Mobile (WhatsApp)"
          value={phone}
          onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(-10))}
          placeholder="98123 45678"
          keyboardType="phone-pad"
          editable={customerId === null}
          prefix="+91"
        />
        {customerId === null && (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Email (optional)" value={email} onChangeText={setEmail} placeholder="accounts@…" keyboardType="email-address" autoCapitalize="none" />
            </View>
            <View className="flex-1">
              <Field label="Category" value={category} onChangeText={setCategory} placeholder="Retail" />
            </View>
          </View>
        )}

        <Field label="Invoice no." value={invoiceNo} onChangeText={setInvoiceNo} placeholder="GKE/25-26/0312" autoCapitalize="characters" />
        <Field
          label="Amount"
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/\D/g, "").slice(0, 10))}
          placeholder="0"
          keyboardType="number-pad"
          prefix="₹"
          big
        />

        <Label>Invoice date</Label>
        <View className="flex-row gap-2">
          {[0, 7, 15, 30].map((d) => (
            <Chip key={d} label={d === 0 ? "Today" : `${d}d ago`} active={raisedDaysAgo === d} onPress={() => setRaisedDaysAgo(d)} />
          ))}
        </View>

        <Label>Credit terms</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {CREDIT_TERMS.map((d) => (
            <Chip key={d} label={`${d} days`} active={terms === d} onPress={() => setTerms(d)} tone={d > 45 ? colors.crimson : colors.gold} />
          ))}
        </ScrollView>
        <Text className="mt-2 text-[13px] text-ink">
          Due <Text className="font-bold text-gold">{formatWeekdayDayMonth(dueDate)}</Text>
          {terms > 45 ? <Text className="text-crimson"> · beyond the 45-day MSME limit</Text> : null}
        </Text>

        {error && <Text className="mt-4 text-sm text-crimson">{error}</Text>}
        {atLimit && <Text className="mt-4 text-sm text-crimson">This month's invoice allowance is used up. Upgrade on the web dashboard to add more.</Text>}

        <View className="mt-6">
          <PrimaryButton label="Add invoice" tone={colors.gold} busy={busy} disabled={!valid || atLimit} onPress={submit} />
        </View>
        <Text className="mt-3 text-center text-[11px] leading-4 text-faint">
          The debtor's outstanding and AI risk score update as soon as it's saved.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
