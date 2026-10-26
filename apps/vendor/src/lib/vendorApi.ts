import { FunctionsHttpError, type PostgrestError } from "@supabase/supabase-js";
import { addDays, startOfToday } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import {
  HISTORY_DAYS,
  type CommitmentRow,
  type CustomerRow,
  type DashboardSnapshot,
  type InteractionType,
  type InvoiceRow,
  type RecoveryPlanRow,
  type ReminderEventRow,
  type TenantMemberRow,
  type TenantRow,
} from "@/types/vendor";

// Every read below runs as the signed-in vendor. RLS ("Owner reads own ...", keyed on
// fn_my_tenant_id()) is what scopes rows to their tenant, so there are no tenant filters here
// that a tampered client could drop to widen access. Writes go through the fn_vendor_* RPCs,
// which derive the tenant from the JWT on the server.

export async function fetchDashboard(): Promise<DashboardSnapshot> {
  const since = addDays(startOfToday(), -HISTORY_DAYS).toISOString();

  const tenantRes = await supabase
    .from("tenants")
    .select("id, business_name, owner_phone, plan, upi_id, udyam_number, udyam_category, is_suspended, created_at")
    .maybeSingle<TenantRow>();
  if (tenantRes.error) throw tenantRes.error;
  const tenant = tenantRes.data;
  if (!tenant) throw new Error("This login isn't linked to a business yet. Sign in with the account you use on the RecoveryAI web app.");

  const [customers, invoices, commitments, reminders, members, plan] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, category, total_outstanding, overdue_days, risk_level, ai_risk_score, ai_insight, broken_promises_count, active_promise_date")
      .order("total_outstanding", { ascending: false })
      .returns<CustomerRow[]>(),
    supabase.from("invoices").select("id, customer_id, invoice_no, amount, due_date, status, invoice_date, created_at").returns<InvoiceRow[]>(),
    supabase
      .from("commitments")
      .select("id, customer_id, interaction_type, promised_amount, promised_date, notes, status, audio_url, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .returns<CommitmentRow[]>(),
    supabase
      .from("reminder_events")
      .select("id, invoice_id, stage, channel, created_by, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .returns<ReminderEventRow[]>(),
    supabase.from("tenant_members").select("id, email, role, status, invited_at").order("invited_at").returns<TenantMemberRow[]>(),
    supabase.rpc("fn_recovery_plan", { p_tenant_id: tenant.id }),
  ]);

  for (const r of [customers, invoices, commitments, reminders, members, plan]) if (r.error) throw r.error;

  return {
    tenant,
    customers: customers.data ?? [],
    invoices: invoices.data ?? [],
    commitments: commitments.data ?? [],
    reminders: reminders.data ?? [],
    members: members.data ?? [],
    recoveryPlan: (plan.data as RecoveryPlanRow[] | null) ?? [],
    fetchedAt: new Date().toISOString(),
  };
}

export type RecoveryCallResult = { status: "queued"; message: string } | { status: "unavailable" | "failed"; message: string };

/**
 * Asks the dialer to place an AI recovery call. The backend has no call-dispatch Edge Function
 * deployed yet, so a 404 comes back as "unavailable" instead of pretending the call went out.
 */
export async function requestRecoveryCall(input: { customerId: string; invoiceId?: string }): Promise<RecoveryCallResult> {
  const { data, error } = await supabase.functions.invoke<{ message?: string }>("ai-recovery-call", {
    body: { customer_id: input.customerId, invoice_id: input.invoiceId ?? null },
  });
  if (!error) return { status: "queued", message: data?.message ?? "AI call queued" };
  if (error instanceof FunctionsHttpError && error.context instanceof Response && error.context.status === 404) {
    return { status: "unavailable", message: "AI dialer isn't connected yet" };
  }
  return { status: "failed", message: error.message };
}

/** A write the server refused, with copy fit to show the vendor. */
export class VendorActionError extends Error {}

const SERVER_MESSAGES: Record<string, string> = {
  PLAN_LIMIT: "You've used this month's invoice allowance. Upgrade your plan to add more.",
  READ_ONLY_MEMBER: "Your team role is view-only. Ask the owner to make changes.",
  TENANT_SUSPENDED: "This business account is suspended. Contact RecoveryAI support.",
  NOT_A_VENDOR: "This login isn't linked to a business.",
  CUSTOMER_NOT_FOUND: "That debtor no longer exists.",
  INVALID_PAUSE_DATE: "Pick a date between tomorrow and 60 days from now.",
  INVALID_PROMISE_DATE: "A promise needs a date between today and 90 days from now.",
  INVALID_AMOUNT: "Enter a valid amount.",
  INVALID_PHONE: "Enter a 10-digit Indian mobile number.",
  INVALID_NAME: "Enter the debtor's name.",
  INVALID_INVOICE_NO: "Enter the invoice number.",
  INVALID_DUE_DATE: "Pick a due date.",
  NOTES_TOO_LONG: "Notes can be at most 2,000 characters.",
};

function toActionError(error: PostgrestError): VendorActionError {
  // PGRST202: the RPC isn't in the schema cache, i.e. the vendor migration hasn't been applied.
  if (error.code === "PGRST202") return new VendorActionError("This action needs a backend update that isn't live yet.");
  if (error.code === "23505") return new VendorActionError("An invoice with this number already exists.");
  const key = Object.keys(SERVER_MESSAGES).find((k) => error.message.includes(k));
  return new VendorActionError(key ? SERVER_MESSAGES[key] : error.message);
}

/** Pause AI calls until `until` (YYYY-MM-DD), or resume them with null. */
export async function pauseAiCalls(customerId: string, until: string | null): Promise<void> {
  const { error } = await supabase.rpc("fn_vendor_pause_ai", { p_customer_id: customerId, p_until: until });
  if (error) throw toActionError(error);
}

export interface InteractionInput {
  customerId: string;
  type: InteractionType;
  amount: number | null;
  date: string | null;
  notes: string;
}

export async function logInteraction(input: InteractionInput): Promise<void> {
  const { error } = await supabase.rpc("fn_vendor_log_interaction", {
    p_customer_id: input.customerId,
    p_interaction_type: input.type,
    p_promised_amount: input.amount,
    p_promised_date: input.date,
    p_notes: input.notes,
  });
  if (error) throw toActionError(error);
}

export interface NewInvoiceInput {
  name: string;
  phone: string;
  email: string;
  category: string;
  invoiceNo: string;
  amount: number;
  dueDate: string;
  invoiceDate: string | null;
}

export async function addInvoice(input: NewInvoiceInput): Promise<void> {
  const { error } = await supabase.rpc("fn_vendor_add_invoice", {
    p_name: input.name,
    p_phone: input.phone,
    p_email: input.email,
    p_category: input.category,
    p_invoice_no: input.invoiceNo,
    p_amount: input.amount,
    p_due_date: input.dueDate,
    p_invoice_date: input.invoiceDate,
  });
  if (error) throw toActionError(error);
}
