import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";
import { secureStorage } from "./secureStorage";

const PREF_KEY = "portal.biometric";

export type BiometricKind = "face" | "fingerprint" | "biometric";

/** What this device can do, or null if it has no enrolled biometrics. */
export async function getBiometricKind(): Promise<BiometricKind | null> {
  if (Platform.OS === "web") return null;
  const [hardware, enrolled] = await Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]);
  if (!hardware || !enrolled) return null;
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
  return "biometric";
}

export function biometricLabel(kind: BiometricKind | null) {
  if (kind === "face") return Platform.OS === "ios" ? "Face ID" : "Face Unlock";
  if (kind === "fingerprint") return Platform.OS === "ios" ? "Touch ID" : "Fingerprint";
  return "Biometrics";
}

/** "on" | "off" | null (never asked). */
export async function getBiometricPref(): Promise<"on" | "off" | null> {
  const v = await secureStorage.getItem(PREF_KEY);
  return v === "on" || v === "off" ? v : null;
}

export async function setBiometricPref(value: "on" | "off" | null) {
  if (value === null) await secureStorage.removeItem(PREF_KEY);
  else await secureStorage.setItem(PREF_KEY, value);
}

export async function promptBiometric(reason = "Unlock RecoveryAI Pay"): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: "Cancel",
    // Device passcode is an acceptable fallback; it is still something only the owner knows.
    disableDeviceFallback: false,
  });
  return result.success;
}
