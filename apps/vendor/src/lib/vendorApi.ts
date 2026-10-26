import { FunctionsHttpError } from "@supabase/supabase-js";
import { startOfMonth } from "@/lib/metrics";
import { supabase } from "@/lib/supabase";
import type { CommitmentRow, CustomerRow, DashboardSnapshot, InvoiceRow, RecoveryPlanRow, TenantRow } from "@/types/vendor";

// Every query below runs as the signed-in vendor. RLS ("Owner reads own ...", keyed on
// fn_my_tenant_id()) is what scopes rows to their tenant, so there are no tenant filters here
// that a tampered client could drop to widen access.

export async function fetchDashboard(): Promise<DashboardSnapshot> {
  const monthStart = startOfMonth().toISOString();

  const tenantRes = await supabase.from("tenants").select("id, business_name, plan, upi_id, is_suspended").maybeSingle<TenantRow>();
  if (tenantRes.error) throw tenantRes.error;
  const tenant = tenantRes.data;
  if (!tenant) throw new Error("This login isn't linked to a business yet. Sign in with the account you use on the RecoveryAI web app.");

  const [customers, invoices, commitments, whatsapp, plan] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone, category, total_outstanding, overdue_days, risk_level, ai_risk_score, ai_insight, broken_promises_count, active_promise_date")
      .returns<CustomerRow[]>(),
    supabase.from("invoices").select("id, customer_id, invoice_no, amount, due_date, status, invoice_date, created_at").returns<InvoiceRow[]>(),
    supabase
      .from("commitments")
      .select("id, customer_id, interaction_type, promised_amount, promised_date, status, audio_url, created_at")
      .gte("created_at", monthStart)
      .returns<CommitmentRow[]>(),
    supabase.from("reminder_events").select("id", { count: "exact", head: true }).eq("channel", "whatsapp").gte("created_at", monthStart),
    supabase.rpc("fn_recovery_plan", { p_tenant_id: tenant.id }),
  ]);

  for (const r of [customers, invoices, commitments, whatsapp, plan]) if (r.error) throw r.error;

  return {
    tenant,
    customers: customers.data ?? [],
    invoices: invoices.data ?? [],
    commitmentsThisMonth: commitments.data ?? [],
    whatsappRemindersThisMonth: whatsapp.count ?? 0,
    recoveryPlan: (plan.data as RecoveryPlanRow[] | null) ?? [],
    fetchedAt: new Date().toISOString(),
  };
}

export type RecoveryCallResult = { status: "queued"; message: string } | { status: "unavailable" | "failed"; message: string };

/**
 * Asks the dialer to place an AI recovery call. The backend has no call-dispatch Edge Function
 * deployed yet, so a 404 comes back as "unavailable" instead of pretending the call went out.
 */
export async function requestRecoveryCall(input: { customerId: string; invoiceId: string }): Promise<RecoveryCallResult> {
  const { data, error } = await supabase.functions.invoke<{ message?: string }>("ai-recovery-call", {
    body: { customer_id: input.customerId, invoice_id: input.invoiceId },
  });
  if (!error) return { status: "queued", message: data?.message ?? "AI call queued" };
  if (error instanceof FunctionsHttpError && error.context instanceof Response && error.context.status === 404) {
    return { status: "unavailable", message: "AI dialer isn't connected yet" };
  }
  return { status: "failed", message: error.message };
}
