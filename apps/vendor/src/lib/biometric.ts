import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

export type BiometricKind = "face" | "fingerprint" | "iris" | "passcode";

/**
 * Strongest unlock this device offers, or null if it has no screen lock at all
 * (we can't enforce anything then, so the shield lets the user through with a warning).
 */
export async function getBiometricKind(): Promise<BiometricKind | null> {
  if (Platform.OS === "web") return null;
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  if (level === LocalAuthentication.SecurityLevel.NONE) return null;
  if (level === LocalAuthentication.SecurityLevel.SECRET) return "passcode";
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
  return "passcode";
}

export function biometricLabel(kind: BiometricKind | null) {
  if (kind === "face") return Platform.OS === "ios" ? "Face ID" : "Face Unlock";
  if (kind === "fingerprint") return Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
  if (kind === "iris") return "Iris";
  return "device passcode";
}

export type BiometricResult = { ok: true } | { ok: false; reason: "cancelled" | "lockout" | "failed" };

export async function promptBiometric(reason = "Unlock RecoveryAI"): Promise<BiometricResult> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: "Cancel",
    // Device passcode is an acceptable fallback; it is still something only the owner knows.
    disableDeviceFallback: false,
  });
  if (result.success) return { ok: true };
  if (result.error === "user_cancel" || result.error === "system_cancel" || result.error === "app_cancel") return { ok: false, reason: "cancelled" };
  if (result.error === "lockout") return { ok: false, reason: "lockout" };
  return { ok: false, reason: "failed" };
}
