import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { signup as apiSignup, type SignupInput } from "@/lib/webApi";

/**
 * loading   → reading the stored session from SecureStore
 * signedOut → show login
 * ready     → signed in; BiometricShield still gates the UI on every open
 */
export type AuthStatus = "loading" | "signedOut" | "ready";

// Testing only: "<email>:<code>" logs in without Supabase Auth and shows sample data.
// Set in eas.json's preview profile; never set it for production builds.
const DEMO = (() => {
  const raw = process.env.EXPO_PUBLIC_DEMO_LOGIN ?? "";
  const i = raw.lastIndexOf(":");
  return i > 0 ? { email: raw.slice(0, i).toLowerCase(), code: raw.slice(i + 1) } : null;
})();

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  isPreview: boolean;
  /** True when screens should show sample data (no Supabase configured, or demo login). */
  useMockData: boolean;
  demo: { email: string; code: string } | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  sendEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, code: string) => Promise<void>;
  /** Creates the account + business on the web app (POST /api/auth/signup), then signs in. */
  signUp: (input: SignupInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? "loading" : "ready");
  const [session, setSession] = useState<Session | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStatus(data.session ? "ready" : "signedOut");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setStatus((prev) => (s ? "ready" : prev === "loading" ? prev : "signedOut"));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isDemoEmail = (email: string) => DEMO !== null && email.trim().toLowerCase() === DEMO.email;

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (isDemoEmail(email)) {
      if (password !== DEMO!.code) throw new Error("Invalid login credentials");
      setIsDemo(true);
      setStatus("ready");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const sendEmailOtp = useCallback(async (email: string) => {
    if (isDemoEmail(email)) return;
    // shouldCreateUser: false — vendors are onboarded on the web app; the app never creates accounts.
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    if (error) throw error;
  }, []);

  const verifyEmailOtp = useCallback(async (email: string, code: string) => {
    if (isDemoEmail(email)) {
      if (code !== DEMO!.code) throw new Error("Invalid code");
      setIsDemo(true);
      setStatus("ready");
      return;
    }
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (input: SignupInput) => {
    await apiSignup({ ...input, email: input.email.trim().toLowerCase() });
    const { error } = await supabase.auth.signInWithPassword({ email: input.email.trim().toLowerCase(), password: input.password });
    if (error) throw new Error("Account created. Sign in with your new email and password.");
  }, []);

  const signOut = useCallback(async () => {
    if (isDemo) {
      setIsDemo(false);
      setStatus("signedOut");
      return;
    }
    if (isSupabaseConfigured) await supabase.auth.signOut();
  }, [isDemo]);

  const value = useMemo(
    () => ({
      status,
      session,
      isPreview: !isSupabaseConfigured,
      useMockData: !isSupabaseConfigured || isDemo,
      demo: DEMO,
      signInWithPassword,
      sendEmailOtp,
      verifyEmailOtp,
      signUp,
      signOut,
    }),
    [status, session, isDemo, signInWithPassword, sendEmailOtp, verifyEmailOtp, signUp, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
