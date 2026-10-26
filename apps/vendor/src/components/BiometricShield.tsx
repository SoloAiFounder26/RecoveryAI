import { BlurTargetView, BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as ScreenCapture from "expo-screen-capture";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View, type AppStateStatus } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { biometricLabel, getBiometricKind, promptBiometric, type BiometricKind } from "@/lib/biometric";
import { colors } from "@/theme/tokens";

/**
 * checking    → reading what the device supports (overlay already up, nothing visible)
 * locked      → waiting for Face ID / fingerprint / passcode
 * noDeviceLock→ the phone has no screen lock, so nothing can be enforced; we refuse to open
 * unlocked    → content visible; still blurred whenever the app leaves the foreground
 */
type Phase = "checking" | "locked" | "noDeviceLock" | "unlocked";

interface Props {
  children: ReactNode;
  /** Only guard while signed in. When false the shield renders children untouched. */
  enabled: boolean;
  /**
   * How long the app may sit in the background before it asks again. 0 = every time it is
   * reopened (the default, per the zero-trust spec). A short grace stops a re-prompt when the
   * vendor flips to WhatsApp and straight back.
   */
  relockAfterMs?: number;
  /** Shown under the lock glyph. */
  title?: string;
  /** Escape hatch on the lock screen for someone who can't pass biometrics (e.g. a new phone). */
  onSignOut?: () => void;
}

const SCREEN_CAPTURE_KEY = "recoveryai-vendor";

// Android shows the mic-permission dialog and the file picker as separate activities, so the app
// reports "background" while they are open. Without this, returning from them relocks the vault
// mid-task (and the voice note or import the vendor started is lost behind the lock screen).
let systemUiUntil = 0;

/** Call right before opening an in-app system dialog (permission prompt, file picker). */
export function expectSystemUi(ms = 60_000) {
  systemUiUntil = Date.now() + ms;
}

/** Call once that dialog has closed. */
export function systemUiDone() {
  systemUiUntil = 0;
}

/**
 * Wraps the signed-in app and:
 *  1. demands Face ID / fingerprint (device passcode as fallback) on cold start and every time
 *     the app comes back from the background,
 *  2. blurs everything the moment the app goes inactive, so balances never show in the app
 *     switcher, a notification shade pull, or an incoming-call banner,
 *  3. blocks screenshots and screen recording (FLAG_SECURE on Android, capture/record
 *     protection on iOS) while signed in.
 *
 * The children stay mounted underneath, so unlocking is instant and nothing re-fetches.
 */
export function BiometricShield({ children, enabled, relockAfterMs = 0, title = "RecoveryAI Vault", onSignOut }: Props) {
  // Web has no secure hardware; let previews through so the UI can be reviewed in a browser.
  const enforce = enabled && Platform.OS !== "web";

  const [phase, setPhase] = useState<Phase>("checking");
  const [obscured, setObscured] = useState(false);
  const [kind, setKind] = useState<BiometricKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authenticating = useRef(false);
  const backgroundedAt = useRef<number | null>(null);
  const leftForOwnDialog = useRef(false);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const blurTarget = useRef<View>(null);

  const authenticate = useCallback(async () => {
    if (authenticating.current) return;
    authenticating.current = true;
    setError(null);
    try {
      const result = await promptBiometric(`Unlock ${title}`);
      if (result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPhase("unlocked");
        setObscured(false);
      } else {
        if (result.reason !== "cancelled") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(
          result.reason === "lockout"
            ? "Too many attempts. Unlock your phone with its passcode, then try again."
            : result.reason === "failed"
              ? "Didn't match. Try again."
              : null,
        );
      }
    } finally {
      authenticating.current = false;
    }
  }, [title]);

  /** Re-read the device's capability and lock. Runs on cold start and on every relock. */
  const lock = useCallback(async () => {
    setPhase("checking");
    const k = await getBiometricKind();
    setKind(k);
    if (!k) return setPhase("noDeviceLock");
    setPhase("locked");
    authenticate();
  }, [authenticate]);

  // Cold start / sign-in: lock immediately.
  useEffect(() => {
    if (!enforce) {
      setPhase("unlocked");
      setObscured(false);
      return;
    }
    lock();
  }, [enforce, lock]);

  // Screenshot / recording protection for as long as a vendor is signed in.
  useEffect(() => {
    if (!enforce) return;
    ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_KEY).catch(() => {});
    // iOS snapshots the window for the app switcher before JS can re-render; this blurs that snapshot natively.
    if (Platform.OS === "ios") ScreenCapture.enableAppSwitcherProtectionAsync(0.95).catch(() => {});
    return () => {
      ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_KEY).catch(() => {});
      if (Platform.OS === "ios") ScreenCapture.disableAppSwitcherProtectionAsync().catch(() => {});
    };
  }, [enforce]);

  // Blur on minimise, relock on return.
  useEffect(() => {
    if (!enforce) return;
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appState.current;
      appState.current = next;
      // The Face ID sheet itself flips iOS to "inactive" and back; that is not the user leaving.
      if (authenticating.current) return;

      if (next === "inactive" || next === "background") {
        setObscured(true);
        if (next === "background") {
          backgroundedAt.current = Date.now();
          // Decided now, while the dialog is up; the opener clears the flag when it closes.
          leftForOwnDialog.current = Date.now() <= systemUiUntil;
        }
        return;
      }

      if (next === "active") {
        const leftAt = backgroundedAt.current;
        backgroundedAt.current = null;
        const ownDialog = leftForOwnDialog.current;
        leftForOwnDialog.current = false;
        if (leftAt !== null && !ownDialog && Date.now() - leftAt >= relockAfterMs) {
          lock();
        } else if (prev !== "active") {
          // Only a glance at the switcher / notification shade: drop the blur, unless still locked.
          setObscured(false);
        }
      }
    });
    return () => sub.remove();
  }, [enforce, lock, relockAfterMs]);

  // Same tree whether or not we enforce, so signing in doesn't remount the navigator.
  const covered = enforce && (phase !== "unlocked" || obscured);

  return (
    <View style={styles.fill}>
      {/* Android blurs only what's inside a BlurTargetView; iOS ignores the target and blurs the window. */}
      <BlurTargetView
        ref={blurTarget}
        style={styles.fill}
        // Hide the vault from screen readers while it's covered, so balances aren't read out.
        importantForAccessibility={covered ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={covered}
      >
        {children}
      </BlurTargetView>

      {covered && (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(220)} style={StyleSheet.absoluteFill}>
          <BlurView
            intensity={100}
            tint="dark"
            blurTarget={blurTarget}
            blurMethod="dimezisBlurViewSdk31Plus"
            style={StyleSheet.absoluteFill}
          >
            {/* Tint on top of the blur, and the only thing Android < 12 shows (no native blur there). */}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(8,8,10,0.72)" }]} />
            {phase === "unlocked" ? (
              <BrandMark />
            ) : (
              <LockPanel
                phase={phase}
                kind={kind}
                title={title}
                error={error}
                onUnlock={authenticate}
                onRecheck={lock}
                onSignOut={onSignOut}
              />
            )}
          </BlurView>
        </Animated.View>
      )}
    </View>
  );
}

/** What the app switcher / notification shade sees: no numbers, just the brand. */
function BrandMark() {
  return (
    <View style={styles.center} pointerEvents="none">
      <Text className="font-mono text-xs uppercase tracking-label text-mute">RecoveryAI · Secured</Text>
    </View>
  );
}

interface LockPanelProps {
  phase: Exclude<Phase, "unlocked">;
  kind: BiometricKind | null;
  title: string;
  error: string | null;
  onUnlock: () => void;
  onRecheck: () => void;
  onSignOut?: () => void;
}

function LockPanel({ phase, kind, title, error, onUnlock, onRecheck, onSignOut }: LockPanelProps) {
  const insets = useSafeAreaInsets();
  const label = biometricLabel(kind);
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(1.08, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const noLock = phase === "noDeviceLock";
  const accent = noLock ? colors.gold : colors.emerald;

  return (
    <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.center} className="px-8">
        <Animated.View
          style={[
            {
              width: 96,
              height: 96,
              borderRadius: 48,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: noLock ? "rgba(255,184,0,0.45)" : "rgba(0,229,153,0.4)",
              backgroundColor: noLock ? "rgba(255,184,0,0.08)" : "rgba(0,229,153,0.1)",
            },
            ring,
          ]}
        >
          <Text style={{ fontSize: 38, color: accent }}>{noLock ? "!" : kind === "fingerprint" ? "◉" : "◎"}</Text>
        </Animated.View>
        <Text className="mt-8 font-mono text-[11px] uppercase tracking-label text-faint">{title}</Text>
        <Text className="mt-2 text-center text-2xl font-extrabold text-ink">{noLock ? "Set a screen lock first" : "Locked"}</Text>
        <Text className="mt-3 text-center text-[15px] leading-6 text-mute">
          {noLock
            ? "RecoveryAI holds your receivables and debtor contacts. Turn on a PIN, fingerprint or Face ID for this phone, then come back."
            : phase === "checking"
              ? "Checking this device…"
              : `Use ${label} to open your receivables.`}
        </Text>
        {error && <Text className="mt-3 text-center text-sm text-crimson">{error}</Text>}
      </View>

      <View className="px-6">
        {phase !== "checking" && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (noLock) Linking.openSettings().catch(() => {});
              else onUnlock();
            }}
            accessibilityRole="button"
            className="h-14 items-center justify-center rounded-full active:opacity-80"
            style={{ backgroundColor: accent }}
          >
            <Text className="text-base font-extrabold text-obsidian">{noLock ? "Open settings" : `Unlock with ${label}`}</Text>
          </Pressable>
        )}
        {noLock && (
          <Pressable onPress={onRecheck} accessibilityRole="button" className="mt-3 h-12 items-center justify-center">
            <Text className="text-sm font-semibold text-mute">I've set one, check again</Text>
          </Pressable>
        )}
        {onSignOut && (
          <Pressable onPress={onSignOut} accessibilityRole="button" className="mt-1 h-12 items-center justify-center">
            <Text className="text-sm font-semibold text-faint">Sign out</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
