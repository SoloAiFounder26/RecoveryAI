import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { getBiometricKind, getBiometricPref, promptBiometric, setBiometricPref, type BiometricKind } from "@/lib/biometric";
import { toE164 } from "@/lib/phone";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

/**
 * loading       → reading the stored session
 * signedOut     → show phone OTP login
 * offerBiometric→ just signed in on a device with biometrics; ask once whether to use them
 * locked        → returning session, biometric unlock required
 * ready         → vault is visible
 */
export type AuthStatus = "loading" | "signedOut" | "offerBiometric" | "locked" | "ready";

// Re-lock if the app was in the background longer than this.
const RELOCK_AFTER_MS = 60_000;

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  biometricKind: BiometricKind | null;
  isPreview: boolean;
  sendOtp: (tenDigit: string, channel: "sms" | "whatsapp") => Promise<void>;
  verifyOtp: (tenDigit: string, code: string) => Promise<void>;
  unlock: () => Promise<boolean>;
  answerBiometricOffer: (enable: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? "loading" : "ready");
  const [session, setSession] = useState<Session | null>(null);
  const [biometricKind, setBiometricKind] = useState<BiometricKind | null>(null);
  const backgroundedAt = useRef<number | null>(null);
  const justSignedIn = useRef(false);

  // Decide where a signed-in user lands: offer biometrics once, lock if enabled, else straight in.
  const settle = useCallback(async (s: Session | null, fresh: boolean) => {
    setSession(s);
    if (!s) return setStatus("signedOut");
    const [kind, pref] = await Promise.all([getBiometricKind(), getBiometricPref()]);
    setBiometricKind(kind);
    if (!kind) return setStatus("ready");
    if (fresh) return setStatus(pref === null ? "offerBiometric" : "ready");
    setStatus(pref === "on" ? "locked" : "ready");
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => settle(data.session, false));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN" && justSignedIn.current) {
        justSignedIn.current = false;
        settle(s, true);
      } else if (event === "SIGNED_OUT") {
        settle(null, false);
      } else if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(s);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [settle]);

  // Re-lock after a while in the background (only if the user turned biometrics on).
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "background") backgroundedAt.current = Date.now();
      if (state === "active" && backgroundedAt.current) {
        const away = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (away > RELOCK_AFTER_MS && session && (await getBiometricPref()) === "on") setStatus("locked");
      }
    });
    return () => sub.remove();
  }, [session]);

  const sendOtp = useCallback(async (tenDigit: string, channel: "sms" | "whatsapp") => {
    const { error } = await supabase.auth.signInWithOtp({ phone: toE164(tenDigit), options: { channel } });
    if (error) throw error;
  }, []);

  const verifyOtp = useCallback(async (tenDigit: string, code: string) => {
    justSignedIn.current = true;
    const { error } = await supabase.auth.verifyOtp({ phone: toE164(tenDigit), token: code, type: "sms" });
    if (error) {
      justSignedIn.current = false;
      throw error;
    }
  }, []);

  const unlock = useCallback(async () => {
    const ok = await promptBiometric();
    if (ok) setStatus("ready");
    return ok;
  }, []);

  const answerBiometricOffer = useCallback(async (enable: boolean) => {
    if (enable && !(await promptBiometric("Confirm to turn on quick unlock"))) return;
    await setBiometricPref(enable ? "on" : "off");
    setStatus("ready");
  }, []);

  const signOut = useCallback(async () => {
    await setBiometricPref(null);
    if (isSupabaseConfigured) await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ status, session, biometricKind, isPreview: !isSupabaseConfigured, sendOtp, verifyOtp, unlock, answerBiometricOffer, signOut }),
    [status, session, biometricKind, sendOtp, verifyOtp, unlock, answerBiometricOffer, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
