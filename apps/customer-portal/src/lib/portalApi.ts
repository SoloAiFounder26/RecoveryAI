import type { CommitmentResult, PortalAccount, PortalCommitment, PortalInvoice } from "@/types/portal";
import { supabase } from "./supabase";

// Every read below is filtered server-side by RLS / the portal RPCs to the
// signed-in debtor's verified phone number. The client never passes a phone or
// tenant id, so there is nothing to tamper with.

export async function fetchAccounts(): Promise<PortalAccount[]> {
  const { data, error } = await supabase.rpc("fn_portal_accounts");
  if (error) throw error;
  return (data ?? []).map((a: PortalAccount) => ({ ...a, total_outstanding: Number(a.total_outstanding) }));
}

export async function fetchInvoices(): Promise<PortalInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, customer_id, invoice_no, amount, due_date, invoice_date, status, created_at")
    .order("due_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i) => ({ ...i, amount: Number(i.amount) }) as PortalInvoice);
}

export async function fetchCommitments(): Promise<PortalCommitment[]> {
  // Via RPC rather than the table so collector notes / call recordings stay vendor-only.
  const { data, error } = await supabase.rpc("fn_portal_commitments");
  if (error) throw error;
  return (data ?? []).map(
    (c: PortalCommitment) => ({ ...c, promised_amount: c.promised_amount == null ? null : Number(c.promised_amount) }),
  );
}

/** Logs "I will pay on <date>" and pauses AI recovery calls for that account until the date. */
export async function submitCommitment(input: {
  customerId: string;
  promisedDate: string; // YYYY-MM-DD
  promisedAmount: number | null;
  note?: string;
}): Promise<CommitmentResult> {
  const { data, error } = await supabase.rpc("fn_portal_set_commitment", {
    p_customer_id: input.customerId,
    p_promised_date: input.promisedDate,
    p_promised_amount: input.promisedAmount,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return data as CommitmentResult;
}
