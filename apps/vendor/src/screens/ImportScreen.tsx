import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BackHeader } from "@/components/BackHeader";
import { Notice } from "@/components/Form";
import { GlassCard } from "@/components/GlassCard";
import { DataGate, GhostButton, PrimaryButton, SectionTitle } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import { formatINR } from "@/lib/format";
import { buildImportPayload, parseWorkbookData, validateRows, type ImportSource, type ParseResult } from "@/lib/importParser";
import { canWrite } from "@/lib/plans";
import type { ImportSummary } from "@/lib/webApi";
import { colors } from "@/theme/tokens";

const SOURCE_LABEL: Record<ImportSource, string> = { tally: "Tally export", zoho: "Zoho Books export", generic: "Spreadsheet" };
const TYPES = [
  "text/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

interface Picked {
  name: string;
  source: ImportSource;
  missingColumns: string[];
  result: ParseResult;
}

/** Bulk upload of debtors + invoices from CSV / Excel (Tally, Zoho Books or any sheet), via POST /api/import. */
export function ImportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { snapshot, loading, error: loadError, refresh, plan, role, importCustomers } = useVendorData();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ImportSummary | null>(null);

  if (!snapshot) return <DataGate loading={loading} error={loadError} onRetry={refresh} />;

  const pick = async () => {
    setError(null);
    setDone(null);
    const res = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    try {
      const data = Platform.OS === "web" && asset.file ? await asset.file.arrayBuffer() : await new File(asset.uri).arrayBuffer();
      const parsed = parseWorkbookData(data);
      setPicked({ name: asset.name, source: parsed.source, missingColumns: parsed.missingColumns, result: validateRows(parsed.rows) });
      Haptics.selectionAsync();
    } catch {
      setPicked(null);
      setError("Couldn't read that file. Upload a .csv, .xls or .xlsx export.");
    }
  };

  const submit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const summary = await importCustomers(buildImportPayload(picked.result.validRows));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(summary);
      setPicked(null);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const locked = !plan?.bulkImport;
  const readOnly = !canWrite(role);
  const r = picked?.result;
  const total = r ? r.validRows.reduce((t, row) => t + Number(row.amount.replace(/dr\.?$/i, "").replace(/[₹,\s]/g, "")), 0) : 0;
  const issues = r ? [...r.errors, ...r.duplicates] : [];

  return (
    <View className="flex-1 bg-obsidian">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}>
        <BackHeader eyebrow="Bulk upload" title="Import debtors" close />

        {locked ? (
          <Notice>CSV / Excel bulk upload is available on the Solo Pro plan. Contact us to upgrade.</Notice>
        ) : readOnly ? (
          <Notice>Your seat is read-only. Ask the owner for edit access.</Notice>
        ) : (
          <>
            <GlassCard glow={colors.gold} style={{ marginTop: 20 }} className="p-5">
              <Text className="text-[15px] font-bold text-ink">Upload a Tally, Zoho Books or Excel export</Text>
              <Text className="mt-1 text-[13px] leading-5 text-mute">
                Columns we read: Customer / Party name, Phone, Invoice no, Amount (or Outstanding / Balance), Due date. One row per invoice.
              </Text>
              <View className="mt-4">
                <PrimaryButton label={picked ? "Choose another file" : "Choose file"} tone={colors.gold} onPress={pick} />
              </View>
            </GlassCard>

            {done && (
              <GlassCard glow={colors.emerald} style={{ marginTop: 16 }} className="p-5">
                <Text className="text-[17px] font-extrabold text-emerald">Import complete</Text>
                <Text className="mt-1 text-[13px] leading-5 text-ink">
                  {done.insertedInvoices} invoices for {done.insertedCustomers} debtors · {formatINR(done.totalOutstanding)} outstanding added.
                </Text>
                <View className="mt-4 flex-row">
                  <GhostButton label="Back to vault" tone={colors.emerald} onPress={() => router.back()} />
                </View>
              </GlassCard>
            )}

            {picked && r && (
              <>
                <View className="mb-3 mt-8">
                  <SectionTitle title={picked.name} sub={SOURCE_LABEL[picked.source]} />
                </View>
                <View className="flex-row gap-2">
                  <Stat label="Ready" value={`${r.validRows.length}`} tone={colors.emerald} />
                  <Stat label="Errors" value={`${r.errors.length}`} tone={r.errors.length ? colors.crimson : colors.mute} />
                  <Stat label="Duplicates" value={`${r.duplicates.length}`} tone={r.duplicates.length ? colors.gold : colors.mute} />
                </View>
                {picked.missingColumns.length > 0 && <Notice tone={colors.crimson}>{`No column found for: ${picked.missingColumns.join(", ")}.`}</Notice>}

                {issues.length > 0 && (
                  <View className="mt-4 overflow-hidden rounded-3xl border border-line bg-surface">
                    {issues.slice(0, 12).map((iss, i) => (
                      <View key={`${iss.row}-${iss.issue}-${i}`} className={`flex-row px-4 py-2.5 ${i === Math.min(issues.length, 12) - 1 ? "" : "border-b border-line"}`}>
                        <Text className="w-14 font-mono text-[11px] text-faint">Row {iss.row}</Text>
                        <Text className="flex-1 text-[12px] text-ink">{iss.issue}</Text>
                        <Text numberOfLines={1} className="ml-2 max-w-[110px] text-[12px] text-mute">
                          {iss.value}
                        </Text>
                      </View>
                    ))}
                    {issues.length > 12 && <Text className="px-4 py-2 text-[11px] text-faint">+{issues.length - 12} more. Fix them in the sheet and upload again.</Text>}
                  </View>
                )}

                {error && <Text className="mt-4 text-sm text-crimson">{error}</Text>}
                <View className="mt-6">
                  <PrimaryButton
                    label={r.validRows.length ? `Import ${r.validRows.length} invoices · ${formatINR(total)}` : "Nothing to import"}
                    busy={busy}
                    disabled={r.validRows.length === 0}
                    onPress={submit}
                  />
                </View>
                <Text className="mt-3 text-center text-[11px] leading-4 text-faint">
                  Rows with errors are skipped. Existing debtors are matched by mobile number; each invoice counts toward your monthly allowance.
                </Text>
              </>
            )}
            {!picked && error && <Text className="mt-4 text-sm text-crimson">{error}</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-line bg-surface px-3 py-3">
      <Text className="font-mono text-[10px] uppercase tracking-label text-mute">{label}</Text>
      <Text className="mt-1 text-[20px] font-extrabold" style={{ color: tone }}>
        {value}
      </Text>
    </View>
  );
}
