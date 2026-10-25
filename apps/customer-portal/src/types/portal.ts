// Shapes returned to the debtor app. They map 1:1 to the portal RPCs and the
// RLS-visible columns defined in supabase/migrations/*_debtor_portal_rls.sql.

export type InvoiceStatus = "Pending" | "Paid" | "Overdue";
export type CommitmentStatus = "pending" | "kept" | "broken";
export type InteractionType =
  | "Promise to Pay"
  | "Partial Payment"
  | "Dispute"
  | "No Response"
  | "Paid"
  | "Other";

/** One vendor (tenant) the signed-in debtor owes money to. From `fn_portal_accounts()`. */
export interface PortalAccount {
  customer_id: string;
  customer_name: string;
  vendor_name: string;
  vendor_upi_id: string | null;
  total_outstanding: number;
  overdue_days: number;
  active_promise_date: string | null; // YYYY-MM-DD; AI calls are paused until this date
  /** Optional vendor-configured early settlement offer. Not in the backend yet; mock data only. */
  early_settlement_discount_pct?: number | null;
  early_settlement_valid_until?: string | null;
}

export interface PortalInvoice {
  id: string;
  customer_id: string;
  invoice_no: string;
  amount: number;
  due_date: string;
  invoice_date: string | null;
  status: InvoiceStatus;
  created_at: string;
}

export interface PortalCommitment {
  id: string;
  customer_id: string;
  interaction_type: InteractionType;
  promised_amount: number | null;
  promised_date: string | null;
  status: CommitmentStatus;
  created_at: string;
}

export interface CommitmentResult {
  commitmentId: string;
  activePromiseDate: string | null;
}
