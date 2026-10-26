import { addDays, daysBetween, parseISODate, startOfToday } from "@/lib/format";
import type { CommitmentRow, CustomerRow, DashboardSnapshot, InvoiceRow } from "@/types/vendor";

export type AgingBucket = "0-30" | "31-60" | "61-90" | "90+";
export const AGING_BUCKETS: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];

/** Statutory payment window for buyers of MSME goods (MSMED Act 2006, s.15). Used as the DSO target line. */
export const MSME_PAYMENT_DAYS = 45;
const DSO_WINDOW_DAYS = 90;

/** Days past due as of today. Not-yet-due invoices count as 0 and sit in the 0-30 bucket. */
export function daysOverdue(dueDate: string, today = startOfToday()): number {
  return Math.max(0, daysBetween(parseISODate(dueDate), today));
}

export function agingBucket(days: number): AgingBucket {
  if (days > 90) return "90+";
  if (days > 60) return "61-90";
  if (days > 30) return "31-60";
  return "0-30";
}

export function isOpen(inv: InvoiceRow) {
  return inv.status !== "Paid";
}

/** The day an invoice was raised. Older rows have no invoice_date, so fall back to when it was entered. */
function raisedOn(inv: InvoiceRow): Date {
  return parseISODate(inv.invoice_date ?? inv.created_at);
}

export interface DebtorInvoice {
  invoice: InvoiceRow;
  customer: CustomerRow | undefined;
  daysOverdue: number;
  bucket: AgingBucket;
  /** customers.active_promise_date is after today, so fn_recovery_plan skips them. On the promise day itself the AI calls again. */
  aiPaused: boolean;
}

export interface DashboardMetrics {
  pendingReceivables: number;
  openInvoiceCount: number;
  debtorCount: number;
  aging: Record<AgingBucket, number>;
  /** Days Sales Outstanding over the trailing 90 days, or null with no sales in that window. */
  dso: number | null;
  /** Amount-weighted average days past due across open invoices. */
  avgDaysOverdue: number;
  recoveredThisMonth: number;
  /** Debtor interactions logged this month (call outcomes: promises, part-payments, disputes...). */
  callOutcomesThisMonth: number;
  promisesThisMonth: number;
  whatsappRemindersThisMonth: number;
  rows: DebtorInvoice[];
}

export function computeMetrics(s: DashboardSnapshot, today = startOfToday()): DashboardMetrics {
  const customersById = new Map(s.customers.map((c) => [c.id, c]));
  const open = s.invoices.filter(isOpen);

  const aging: Record<AgingBucket, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  let pending = 0;
  let weightedDays = 0;
  const rows: DebtorInvoice[] = open.map((invoice) => {
    const days = daysOverdue(invoice.due_date, today);
    const bucket = agingBucket(days);
    const amount = Number(invoice.amount);
    aging[bucket] += amount;
    pending += amount;
    weightedDays += amount * days;
    const customer = customersById.get(invoice.customer_id);
    const promise = customer?.active_promise_date;
    return { invoice, customer, daysOverdue: days, bucket, aiPaused: Boolean(promise && parseISODate(promise) > today) };
  });
  rows.sort((a, b) => b.daysOverdue - a.daysOverdue || Number(b.invoice.amount) - Number(a.invoice.amount));

  // DSO = receivables / credit sales in the window x days in the window.
  const windowStart = addDays(today, -DSO_WINDOW_DAYS);
  const sales = s.invoices.filter((i) => raisedOn(i) >= windowStart).reduce((sum, i) => sum + Number(i.amount), 0);
  const dso = sales > 0 ? Math.round((pending / sales) * DSO_WINDOW_DAYS) : null;

  return {
    pendingReceivables: pending,
    openInvoiceCount: open.length,
    debtorCount: new Set(open.map((i) => i.customer_id)).size,
    aging,
    dso,
    avgDaysOverdue: pending > 0 ? Math.round(weightedDays / pending) : 0,
    recoveredThisMonth: recovered(s.commitmentsThisMonth),
    callOutcomesThisMonth: s.commitmentsThisMonth.length,
    promisesThisMonth: s.commitmentsThisMonth.filter((c) => c.interaction_type === "Promise to Pay").length,
    whatsappRemindersThisMonth: s.whatsappRemindersThisMonth,
    rows,
  };
}

/** Money that actually came in: commitments logged as Paid or Partial Payment carry the amount received. */
function recovered(commitments: CommitmentRow[]) {
  return commitments
    .filter((c) => c.interaction_type === "Paid" || c.interaction_type === "Partial Payment")
    .reduce((sum, c) => sum + Number(c.promised_amount ?? 0), 0);
}

export function startOfMonth(today = startOfToday()) {
  return new Date(today.getFullYear(), today.getMonth(), 1);
}
