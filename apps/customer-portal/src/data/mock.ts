import { addDays, startOfToday, toISODate } from "@/lib/format";
import type { PortalAccount, PortalCommitment, PortalInvoice } from "@/types/portal";

// Preview data used when Supabase env vars are not set. Dates are relative to
// today so overdue counts and commitment chips always look realistic.
const today = startOfToday();
const d = (offset: number) => toISODate(addDays(today, offset));

export const mockAccounts: PortalAccount[] = [
  {
    customer_id: "c-sharma",
    customer_name: "Sharma Traders",
    vendor_name: "Ganesh & Kartike Electronics",
    vendor_upi_id: "ganeshkartike@okhdfcbank",
    total_outstanding: 284750,
    overdue_days: 23,
    active_promise_date: null,
    early_settlement_discount_pct: 2,
    early_settlement_valid_until: d(5),
  },
  {
    customer_id: "c-sharma-2",
    customer_name: "Sharma Traders",
    vendor_name: "Shree Balaji Distributors",
    vendor_upi_id: "balajidist@icici",
    total_outstanding: 62400,
    overdue_days: 0,
    active_promise_date: d(11),
  },
];

export const mockInvoices: PortalInvoice[] = [
  { id: "i1", customer_id: "c-sharma", invoice_no: "GKE/24-25/0187", amount: 148500, due_date: d(-23), invoice_date: d(-53), status: "Overdue", created_at: d(-53) },
  { id: "i2", customer_id: "c-sharma", invoice_no: "GKE/24-25/0203", amount: 96250, due_date: d(-9), invoice_date: d(-39), status: "Overdue", created_at: d(-39) },
  { id: "i3", customer_id: "c-sharma", invoice_no: "GKE/24-25/0231", amount: 40000, due_date: d(6), invoice_date: d(-24), status: "Pending", created_at: d(-24) },
  { id: "i4", customer_id: "c-sharma-2", invoice_no: "SBD-4471", amount: 62400, due_date: d(4), invoice_date: d(-26), status: "Pending", created_at: d(-26) },
  { id: "i5", customer_id: "c-sharma", invoice_no: "GKE/24-25/0142", amount: 118900, due_date: d(-41), invoice_date: d(-71), status: "Paid", created_at: d(-71) },
  { id: "i6", customer_id: "c-sharma-2", invoice_no: "SBD-4302", amount: 27350, due_date: d(-18), invoice_date: d(-48), status: "Paid", created_at: d(-48) },
];

export const mockCommitments: PortalCommitment[] = [
  { id: "m1", customer_id: "c-sharma-2", interaction_type: "Promise to Pay", promised_amount: 62400, promised_date: d(11), status: "pending", created_at: d(-2) },
  { id: "m2", customer_id: "c-sharma", interaction_type: "Partial Payment", promised_amount: 50000, promised_date: d(3), status: "pending", created_at: d(-1) },
  { id: "m3", customer_id: "c-sharma", interaction_type: "Promise to Pay", promised_amount: 118900, promised_date: d(-43), status: "kept", created_at: d(-50) },
];
