import { BottomSheetTextInput, type BottomSheetModal } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { forwardRef, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Sheet } from "@/components/Sheet";
import { Chip, PrimaryButton } from "@/components/ui";
import { VoiceNoteButton } from "@/components/VoiceNoteButton";
import type { VoiceActionResult } from "@/lib/webApi";
import { addDays, daysBetween, formatWeekdayDayMonth, parseISODate, startOfToday, toISODate } from "@/lib/format";
import { colors } from "@/theme/tokens";
import type { InteractionType } from "@/types/vendor";

const PAUSE_PRESETS = [3, 7, 15, 30];

interface PauseProps {
  name: string;
  /** customers.active_promise_date when it's in the future, else null. */
  pausedUntil: string | null;
  onSubmit: (until: string | null) => Promise<void>;
}

/** Quick manual override: hold AI calls for a debtor who part-paid or gave a verbal promise. */
export const PauseAiSheet = forwardRef<BottomSheetModal, PauseProps>(function PauseAiSheet({ name, pausedUntil, onSubmit }, ref) {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const until = toISODate(addDays(startOfToday(), days));

  const run = async (value: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (ref && typeof ref !== "function") ref.current?.dismiss();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      ref={ref}
      title={pausedUntil ? "AI calls are paused" : "Pause AI calls"}
      subtitle={
        pausedUntil
          ? `No AI calls to ${name} until ${formatWeekdayDayMonth(parseISODate(pausedUntil))}. Resume now, or move the date.`
          : `Hold AI calls to ${name} after a part-payment or a verbal promise. WhatsApp reminders keep their schedule.`
      }
    >
      <Text className="font-mono text-[10px] uppercase tracking-label text-mute">Pause for</Text>
      <View className="mt-2 flex-row gap-2">
        {PAUSE_PRESETS.map((d) => (
          <Chip key={d} label={`${d} days`} active={days === d} onPress={() => setDays(d)} tone={colors.gold} />
        ))}
      </View>
      <Text className="mt-3 text-[14px] text-ink">
        Calls resume on <Text className="font-bold text-gold">{formatWeekdayDayMonth(parseISODate(until))}</Text>
      </Text>
      {error && <Text className="mt-3 text-sm text-crimson">{error}</Text>}
      <View className="mt-5">
        <PrimaryButton label={pausedUntil ? "Move pause date" : "Pause AI calls"} tone={colors.gold} busy={busy} onPress={() => run(until)} />
      </View>
      {pausedUntil && (
        <View className="mt-3">
          <PrimaryButton label="Resume AI calls now" busy={busy} onPress={() => run(null)} />
        </View>
      )}
    </Sheet>
  );
});

const TYPES: { type: InteractionType; tone: string }[] = [
  { type: "Promise to Pay", tone: colors.gold },
  { type: "Partial Payment", tone: colors.emerald },
  { type: "Paid", tone: colors.emerald },
  { type: "Dispute", tone: colors.crimson },
  { type: "No Response", tone: colors.mute },
  { type: "Other", tone: colors.ink },
];
const PROMISE_PRESETS = [0, 3, 7, 15, 30];

export interface OutcomeInput {
  type: InteractionType;
  amount: number | null;
  date: string | null;
  notes: string;
}

interface OutcomeProps {
  name: string;
  outstanding: number;
  onSubmit: (input: OutcomeInput) => Promise<void>;
  /** Voice note → structured outcome (POST /api/voice-action). Hidden when absent. */
  onTranscribe?: (uri: string, mimeType: string) => Promise<VoiceActionResult>;
}

/** Log what came out of a call (or a payment that arrived) against the debtor's record. */
export const LogOutcomeSheet = forwardRef<BottomSheetModal, OutcomeProps>(function LogOutcomeSheet({ name, outstanding, onSubmit, onTranscribe }, ref) {
  const [type, setType] = useState<InteractionType>("Promise to Pay");
  const [amount, setAmount] = useState("");
  const [inDays, setInDays] = useState(7);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);

  const applyVoice = (r: VoiceActionResult) => {
    setTranscript(r.transcript);
    setType(r.interaction_type);
    if (r.promised_amount) setAmount(String(r.promised_amount));
    if (r.promised_date) setInDays(Math.min(Math.max(daysBetween(startOfToday(), parseISODate(r.promised_date)), 0), 90));
    if (r.notes) setNotes(r.notes);
  };
  const datePresets = PROMISE_PRESETS.includes(inDays) ? PROMISE_PRESETS : [...PROMISE_PRESETS, inDays].sort((a, b) => a - b);

  const needsAmount = type === "Promise to Pay" || type === "Partial Payment" || type === "Paid";
  const needsDate = type === "Promise to Pay";
  const parsed = Number(amount.replace(/[^\d.]/g, ""));
  const amountOk = !needsAmount || (parsed > 0 && (type !== "Partial Payment" || parsed < outstanding));

  useEffect(() => {
    if (type === "Paid") setAmount((a) => a || String(Math.round(outstanding)));
  }, [type, outstanding]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        type,
        amount: needsAmount ? parsed : null,
        date: needsDate ? toISODate(addDays(startOfToday(), inDays)) : null,
        notes: notes.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNotes("");
      setAmount("");
      setTranscript(null);
      if (ref && typeof ref !== "function") ref.current?.dismiss();
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet ref={ref} title="Log call outcome" subtitle={`What did ${name} say?`}>
      {onTranscribe && (
        <View className="mb-4">
          <VoiceNoteButton onTranscribe={onTranscribe} onResult={applyVoice} />
          {transcript ? (
            <Text className="mt-2 text-[12px] italic leading-4 text-mute">“{transcript}”</Text>
          ) : null}
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {TYPES.map((t) => (
          <Chip key={t.type} label={t.type} tone={t.tone} active={type === t.type} onPress={() => setType(t.type)} />
        ))}
      </ScrollView>

      {needsAmount && (
        <>
          <Text className="mt-4 font-mono text-[10px] uppercase tracking-label text-mute">
            {type === "Promise to Pay" ? "Amount promised" : "Amount received"}
          </Text>
          <View className="mt-2 h-14 flex-row items-center rounded-2xl border border-line bg-surface px-4">
            <Text className="mr-2 text-lg font-bold text-mute">₹</Text>
            <BottomSheetTextInput
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^\d]/g, "").slice(0, 10))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.faint}
              style={{ flex: 1, color: colors.ink, fontSize: 20, fontWeight: "700" }}
            />
          </View>
          {(type === "Paid" || type === "Partial Payment") && (
            <Text className="mt-2 text-[12px] leading-4 text-gold">
              {type === "Partial Payment" && parsed >= outstanding
                ? "That covers the full balance. Use Paid instead."
                : "This settles the debtor's invoices oldest-first by this amount."}
            </Text>
          )}
        </>
      )}

      {needsDate && (
        <>
          <Text className="mt-4 font-mono text-[10px] uppercase tracking-label text-mute">Will pay on</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2" contentContainerStyle={{ gap: 8 }}>
            {datePresets.map((d) => (
              <Chip key={d} label={d === 0 ? "Today" : formatWeekdayDayMonth(addDays(startOfToday(), d))} active={inDays === d} onPress={() => setInDays(d)} tone={colors.gold} />
            ))}
          </ScrollView>
          <Text className="mt-2 text-[12px] text-mute">AI calls pause until this date; a missed date counts as a broken promise.</Text>
        </>
      )}

      <Text className="mt-4 font-mono text-[10px] uppercase tracking-label text-mute">Notes</Text>
      <BottomSheetTextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. Accounts team said cheque on Friday"
        placeholderTextColor={colors.faint}
        multiline
        maxLength={2000}
        style={{
          marginTop: 8,
          minHeight: 72,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.surface,
          color: colors.ink,
          fontSize: 15,
          padding: 14,
          textAlignVertical: "top",
        }}
      />

      {error && <Text className="mt-3 text-sm text-crimson">{error}</Text>}
      <View className="mt-5">
        <PrimaryButton label="Save outcome" busy={busy} disabled={!amountOk} onPress={submit} />
      </View>
    </Sheet>
  );
});
