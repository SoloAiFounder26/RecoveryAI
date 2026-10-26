// Row shapes as the vendor's RLS-scoped session reads them from Supabase.
// Column names match the live `public` schema 1:1; nothing here is a new table.

export type Plan = "free" | "pro" | "growth";
export type RiskLevel = "High" | "Medium" | "Low";
export type InvoiceStatus = "Pending" | "Paid" | "Overdue";
export type InteractionType = "Promise to Pay" | "Partial Payment" | "Dispute" | "No Response" | "Paid" | "Other";

export interface TenantRow {
  id: string;
  business_name: string;
  plan: Plan;
  upi_id: string | null;
  is_suspended: boolean;
}

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  category: string | null;
  total_outstanding: number;
  overdue_days: number;
  risk_level: RiskLevel;
  ai_risk_score: number;
  ai_insight: string | null;
  broken_promises_count: number;
  active_promise_date: string | null;
}

export interface InvoiceRow {
  id: string;
  customer_id: string;
  invoice_no: string;
  amount: number;
  due_date: string;
  status: InvoiceStatus;
  invoice_date: string | null;
  created_at: string;
}

export interface CommitmentRow {
  id: string;
  customer_id: string;
  interaction_type: InteractionType;
  promised_amount: number | null;
  promised_date: string | null;
  status: "pending" | "kept" | "broken";
  audio_url: string | null;
  created_at: string;
}

/** One row of `fn_recovery_plan(p_tenant_id)`: the AI's "call these first" queue. */
export interface RecoveryPlanRow {
  customer_id: string;
  name: string;
  phone: string;
  risk_level: RiskLevel;
  ai_risk_score: number;
  total_outstanding: number;
  overdue_days: number;
  active_promise_date: string | null;
  broken_promises_count: number;
  ai_insight: string | null;
  queue_reason: "promised_today" | "broken_promise" | "high_risk_overdue";
  priority_rank: number;
}

export interface DashboardSnapshot {
  tenant: TenantRow | null;
  customers: CustomerRow[];
  invoices: InvoiceRow[];
  /** Commitments logged since the 1st of this month. */
  commitmentsThisMonth: CommitmentRow[];
  /** `reminder_events` rows with channel = 'whatsapp' since the 1st of this month. */
  whatsappRemindersThisMonth: number;
  recoveryPlan: RecoveryPlanRow[];
  fetchedAt: string;
}
