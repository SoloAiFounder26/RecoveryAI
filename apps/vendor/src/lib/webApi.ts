import { supabase } from "@/lib/supabase";
import type { Channel, Tone } from "@/lib/plans";
import type { Lang } from "@/lib/templates";
import type { InteractionType } from "@/types/vendor";

// Client for the RecoveryAI web app's own API (app.zaravito.com/api/*). Writes that need the
// service role (reminder log, profile, team, support, bulk import, signup) and the Gemini voice
// parser live there, so the app calls them with the signed-in user's Supabase token as a bearer
// instead of re-implementing them. The server derives the tenant from that token.

const BASE = (process.env.EXPO_PUBLIC_WEB_API_URL ?? "https://app.zaravito.com").replace(/\/+$/, "");

/** A refusal from the web API, carrying its user-facing message. */
export class WebApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (auth) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new WebApiError("Your session has expired. Sign in again.", 401);
    headers.set("Authorization", `Bearer ${token}`);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new WebApiError("Can't reach RecoveryAI. Check your internet connection.", 0);
  }
  let body: { success?: boolean; data?: T; error?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON (e.g. an HTML error page): fall through to the generic message.
  }
  if (!res.ok || !body?.success) {
    // 401 on a valid session means the deployed server doesn't accept app tokens yet.
    const fallback = res.status === 401 ? "The RecoveryAI server didn't accept the app login. Try again after the latest web update is live." : `Request failed (${res.status}).`;
    throw new WebApiError(body?.error ?? fallback, res.status);
  }
  return body.data as T;
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

// ---------- reminders ----------

export interface DraftResult {
  subject: string | null;
  body: string;
  text: string;
  statutory: boolean;
  note: string | null;
  daysOverdue: number;
}

export function fetchDraft(input: { invoiceId: string; tone: Tone; channel: Channel; lang: Lang }): Promise<DraftResult> {
  return request<DraftResult>("/api/drafts", json("POST", input));
}

export function markReminderSent(invoiceId: string, channel: Channel): Promise<{ invoiceId: string; stage: number }> {
  return request("/api/reminders", json("POST", { invoiceId, channel }));
}

// ---------- AI conversation (voice note → Gemini) ----------

export interface VoiceActionResult {
  transcript: string;
  customer_name: string | null;
  promised_amount: number | null;
  promised_date: string | null;
  interaction_type: InteractionType;
  notes: string;
}

export function transcribeVoiceNote(uri: string, mimeType: string): Promise<VoiceActionResult> {
  const form = new FormData();
  const ext = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : (mimeType.split("/")[1] ?? "audio");
  // React Native's FormData takes a { uri, name, type } file descriptor.
  form.append("audio", { uri, name: `voice-note.${ext}`, type: mimeType } as unknown as Blob);
  form.append("mimeType", mimeType);
  return request<VoiceActionResult>("/api/voice-action", { method: "POST", body: form });
}

// ---------- bulk import ----------

export interface ImportCustomerPayload {
  name: string;
  phone: string;
  category?: string | null;
  invoices: { invoiceNo: string; amount: number; dueDate: string; status?: "Pending" | "Paid" | "Overdue" }[];
}

export interface ImportSummary {
  insertedCustomers: number;
  insertedInvoices: number;
  totalOutstanding: number;
}

export function importCustomers(customers: ImportCustomerPayload[]): Promise<ImportSummary> {
  return request<ImportSummary>("/api/import", json("POST", { customers }));
}

// ---------- business profile ----------

export interface ProfilePatch {
  upiId?: string | null;
  bankDetails?: string | null;
  udyamNumber?: string | null;
  udyamCategory?: "micro" | "small" | "medium" | null;
  udyamRegisteredOn?: string | null;
}

export function updateProfile(patch: ProfilePatch): Promise<unknown> {
  return request("/api/tenant", json("PATCH", patch));
}

// ---------- team ----------

export interface TeamMember {
  id: string;
  email: string;
  role: "member" | "viewer";
  status: "invited" | "active";
  invited_at: string;
  /** Only returned to the owner, for pending invites. */
  inviteCode?: string;
}

export interface TeamResult {
  seatLimit: number;
  canManage: boolean;
  members: TeamMember[];
}

export function fetchTeam(): Promise<TeamResult> {
  return request<TeamResult>("/api/team");
}

export function inviteMember(email: string, role: "member" | "viewer"): Promise<TeamMember> {
  return request<TeamMember>("/api/team", json("POST", { email, role }));
}

export function removeMember(id: string): Promise<{ id: string }> {
  return request(`/api/team?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---------- help & support ----------

export interface SupportRequest {
  id: string;
  subject: string;
  message: string;
  priority: boolean;
  status: string;
  created_at: string;
  support_replies?: { id: string; message: string; created_at: string; is_ai: boolean }[];
}

export function fetchSupport(): Promise<{ priority: boolean; requests: SupportRequest[] }> {
  return request("/api/support");
}

export function sendSupportRequest(subject: string, message: string): Promise<SupportRequest> {
  return request<SupportRequest>("/api/support", json("POST", { subject, message }));
}

// ---------- signup ----------

export interface SignupInput {
  email: string;
  password: string;
  businessName: string;
  ownerPhone: string;
  inviteCode: string | null;
}

/** Creates the login + business on the server; the app then signs in with Supabase itself. */
export function signup(input: SignupInput): Promise<{ businessName: string }> {
  return request("/api/auth/signup", json("POST", input), false);
}
