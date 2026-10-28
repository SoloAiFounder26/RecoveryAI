// Row shapes as the vendor's RLS-scoped session reads them from Supabase.
// Column names match the live `public` schema 1:1; nothing here is a new table.

export type Plan = "free" | "pro" | "growth";
export type RiskLevel = "High" | "Medium" | "Low";
export type InvoiceStatus = "Pending" | "Paid" | "Overdue";
export type InteractionType = "Promise to Pay" | "Partial Payment" | "Dispute" | "No Response" | "Paid" | "Other";

export interface TenantRow {
  id: string;
  business_name: string;
  owner_phone: string;
  plan: Plan;
  /** The owner's login. Anyone else reading this row is a team seat. */
  auth_user_id: string;
  upi_id: string | null;
  /** Free-text NEFT details printed under reminders. */
  bank_details: string | null;
  udyam_number: string | null;
  udyam_category: "micro" | "small" | "medium" | null;
  udyam_registered_on: string | null;
  is_suspended: boolean;
  created_at: string;
}

export interface TenantMemberRow {
  id: string;
  email: string;
  role: "member" | "viewer";
  status: "invited" | "active";
  invited_at: string;
}

/** One automated reminder sent for an invoice (stage 1-3 of the chain). */
export interface ReminderEventRow {
  id: string;
  invoice_id: string;
  stage: 1 | 2 | 3;
  channel: "whatsapp" | "email";
  created_by: string | null;
  created_at: string;
}

export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
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
  /** Call summary / transcript written by the AI agent or the vendor. */
  notes: string | null;
  status: "pending" | "kept" | "broken";
  /** Call recording, when the dialer stored one. */
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

/** How far back the app loads commitments and reminders. */
export const HISTORY_DAYS = 180;

export interface DashboardSnapshot {
  tenant: TenantRow | null;
  customers: CustomerRow[];
  invoices: InvoiceRow[];
  /** Call outcomes / promises, newest first, last HISTORY_DAYS days. */
  commitments: CommitmentRow[];
  /** Reminder chain events, newest first, last HISTORY_DAYS days. */
  reminders: ReminderEventRow[];
  members: TenantMemberRow[];
  recoveryPlan: RecoveryPlanRow[];
  fetchedAt: string;
}

/** Monthly invoice allowance per plan (mirrors fn_plan_invoice_limit). null = unlimited. */
export const PLAN_INVOICE_LIMIT: Record<Plan, number | null> = { free: 3, pro: 15, growth: null };
export const PLAN_PRICE: Record<Plan, number> = { free: 0, pro: 499, growth: 1499 };
export const PLAN_LABEL: Record<Plan, string> = { free: "Free", pro: "Pro", growth: "Growth" };
