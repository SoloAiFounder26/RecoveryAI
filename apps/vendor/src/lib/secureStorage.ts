import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Supabase sessions (JWT + refresh token + user) exceed SecureStore's ~2 KB
// per-value limit, so values are split across numbered keys. Everything stays in
// the iOS Keychain / Android Keystore; nothing is written to AsyncStorage.
const CHUNK = 1800;
const opts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

async function getItem(key: string): Promise<string | null> {
  const k = safeKey(key);
  const count = await SecureStore.getItemAsync(`${k}.n`, opts);
  if (!count) return null;
  const parts = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) => SecureStore.getItemAsync(`${k}.${i}`, opts)),
  );
  return parts.some((p) => p === null) ? null : parts.join("");
}

async function removeItem(key: string): Promise<void> {
  const k = safeKey(key);
  const count = Number((await SecureStore.getItemAsync(`${k}.n`, opts)) ?? 0);
  await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${k}.${i}`, opts)));
  await SecureStore.deleteItemAsync(`${k}.n`, opts);
}

async function setItem(key: string, value: string): Promise<void> {
  await removeItem(key);
  const k = safeKey(key);
  const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, "g")) ?? [""];
  await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${k}.${i}`, c, opts)));
  await SecureStore.setItemAsync(`${k}.n`, String(chunks.length), opts);
}

// Web has no secure enclave; this branch exists only so the UI can be previewed in a browser.
const webStorage = {
  getItem: async (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
  removeItem: async (key: string) => globalThis.localStorage?.removeItem(key),
};

export const secureStorage = Platform.OS === "web" ? webStorage : { getItem, setItem, removeItem };
