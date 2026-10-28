import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/AuthProvider";
import { BackHeader } from "@/components/BackHeader";
import { Field, Label, Notice } from "@/components/Form";
import { GlassCard } from "@/components/GlassCard";
import { Chip, DataGate, Pill, PrimaryButton, SectionTitle } from "@/components/ui";
import { useVendorData } from "@/data/VendorDataProvider";
import type { TeamMember, TeamResult } from "@/lib/webApi";
import { colors } from "@/theme/tokens";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Seats for an accountant / CA: invite by email + a one-time code, or remove. Seat count follows the plan. */
export function TeamScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { snapshot, loading, error: loadError, refresh, loadTeam, inviteMember, removeMember } = useVendorData();
  const [team, setTeam] = useState<TeamResult | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "viewer">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCode, setLastCode] = useState<{ email: string; code: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const reload = useCallback(() => {
    setTeamError(null);
    loadTeam()
      .then(setTeam)
      .catch((e: unknown) => setTeamError(e instanceof Error ? e.message : String(e)));
  }, [loadTeam]);
  // Re-read whenever the roster in the shared snapshot changes (after an invite or removal too).
  const members = snapshot?.members;
  useEffect(() => {
    if (members) reload();
  }, [reload, members]);

  if (!snapshot) return <DataGate loading={loading} error={loadError} onRetry={refresh} />;

  const used = 1 + (team?.members.length ?? snapshot.members.length);
  const limit = team?.seatLimit ?? 1;
  const canManage = Boolean(team?.canManage);

  const invite = async () => {
    setBusy(true);
    setError(null);
    try {
      const created: TeamMember = await inviteMember(email.trim().toLowerCase(), role);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (created.inviteCode) setLastCode({ email: created.email, code: created.inviteCode });
      setEmail("");
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setRemoving(id);
    setError(null);
    try {
      await removeMember(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <View className="flex-1 bg-obsidian">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }}>
        <BackHeader eyebrow="Team" title={`${used} of ${limit} seats`} />

        {teamError && <Notice tone={colors.crimson}>{teamError}</Notice>}
        {!team && !teamError && <ActivityIndicator color={colors.mute} style={{ marginTop: 32 }} />}

        {team && (
          <>
            <View className="mb-3 mt-6">
              <SectionTitle title="People" />
            </View>
            <View className="overflow-hidden rounded-3xl border border-line bg-surface">
              <Row email={session?.user.email ?? "You (owner)"} badge="Owner" tone={colors.emerald} last={team.members.length === 0} />
              {team.members.map((m, i) => (
                <Row
                  key={m.id}
                  email={m.email}
                  badge={m.status === "invited" ? "Invited" : m.role === "viewer" ? "Viewer" : "Member"}
                  tone={m.status === "invited" ? colors.gold : colors.ink}
                  code={m.inviteCode}
                  last={i === team.members.length - 1}
                  onRemove={canManage ? () => remove(m.id) : undefined}
                  removing={removing === m.id}
                />
              ))}
            </View>

            {lastCode && (
              <GlassCard glow={colors.gold} style={{ marginTop: 16 }} className="p-4">
                <Text className="text-[14px] font-bold text-ink">Share this code with {lastCode.email}</Text>
                <Text className="mt-1 text-[12px] leading-5 text-mute">They sign up on RecoveryAI with that email and enter the code to join your business.</Text>
                <Pressable
                  onPress={async () => {
                    await Clipboard.setStringAsync(lastCode.code);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                  className="mt-3 items-center rounded-2xl border border-gold/40 bg-gold/10 py-3"
                >
                  <Text className="font-mono text-[20px] font-bold tracking-label text-gold">{lastCode.code}</Text>
                  <Text className="mt-1 text-[11px] text-mute">Tap to copy</Text>
                </Pressable>
              </GlassCard>
            )}

            {!canManage ? (
              <Notice>Only the account owner can invite or remove people.</Notice>
            ) : limit <= 1 ? (
              <Notice>Team seats for your accountant or CA are on the MSME Growth plan (3 seats).</Notice>
            ) : used >= limit ? (
              <Notice>{`Your plan includes ${limit} seats and all are in use. Remove someone to invite another person.`}</Notice>
            ) : (
              <>
                <View className="mt-8">
                  <SectionTitle title="Invite accountant / CA" />
                </View>
                <Field label="Email" value={email} onChangeText={setEmail} placeholder="ca@firm.in" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                <Label>Access</Label>
                <View className="flex-row gap-2">
                  <Chip label="Member · can edit" active={role === "member"} onPress={() => setRole("member")} tone={colors.emerald} />
                  <Chip label="Viewer · read only" active={role === "viewer"} onPress={() => setRole("viewer")} />
                </View>
                {error && <Text className="mt-3 text-sm text-crimson">{error}</Text>}
                <View className="mt-5">
                  <PrimaryButton label="Send invite" busy={busy} disabled={!EMAIL_RE.test(email.trim())} onPress={invite} />
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Row({
  email,
  badge,
  tone,
  code,
  last,
  onRemove,
  removing,
}: {
  email: string;
  badge: string;
  tone: string;
  code?: string;
  last: boolean;
  onRemove?: () => void;
  removing?: boolean;
}) {
  return (
    <View className={`px-4 py-3.5 ${last ? "" : "border-b border-line"}`}>
      <View className="flex-row items-center">
        <View className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-raised">
          <Text className="text-[12px] font-extrabold text-ink">{email[0]?.toUpperCase()}</Text>
        </View>
        <Text numberOfLines={1} className="flex-1 text-[13px] text-ink">
          {email}
        </Text>
        <Pill label={badge} tone={tone} />
        {onRemove && (
          <Pressable onPress={onRemove} disabled={removing} accessibilityLabel={`Remove ${email}`} className="ml-3 px-1">
            {removing ? <ActivityIndicator size="small" color={colors.crimson} /> : <Text className="text-[13px] font-bold text-crimson">Remove</Text>}
          </Pressable>
        )}
      </View>
      {code ? <Text className="ml-11 mt-1 font-mono text-[11px] text-gold">Invite code {code}</Text> : null}
    </View>
  );
}
