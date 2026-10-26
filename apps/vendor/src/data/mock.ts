import { addDays, startOfToday, toISODate } from "@/lib/format";
import type { CommitmentRow, CustomerRow, DashboardSnapshot, InvoiceRow, RecoveryPlanRow, ReminderEventRow, TenantMemberRow } from "@/types/vendor";

// Sample book for previews and the test-build demo login. Shaped exactly like the live rows.

const today = startOfToday();
const d = (offset: number) => toISODate(addDays(today, offset));

const customers: CustomerRow[] = [
  { id: "c1", name: "Shree Balaji Traders", phone: "9812345678", email: "accounts@shreebalaji.in", category: "Wholesale", total_outstanding: 486500, overdue_days: 112, risk_level: "High", ai_risk_score: 91, ai_insight: "Two broken promises. Responds to calls after 6 pm.", broken_promises_count: 2, active_promise_date: null },
  { id: "c2", name: "Patel Hardware & Sons", phone: "9876501234", email: null, category: "Retail", total_outstanding: 212000, overdue_days: 74, risk_level: "High", ai_risk_score: 78, ai_insight: "Promised to pay today on the last call.", broken_promises_count: 1, active_promise_date: d(0) },
  { id: "c3", name: "Krishna Electricals", phone: "9988776655", email: null, category: "Retail", total_outstanding: 158400, overdue_days: 41, risk_level: "Medium", ai_risk_score: 55, ai_insight: "Paid part last month; usually clears within 2 weeks of a reminder.", broken_promises_count: 0, active_promise_date: d(6) },
  { id: "c4", name: "Gupta Distributors", phone: "9123456780", email: null, category: "Distributor", total_outstanding: 342750, overdue_days: 96, risk_level: "High", ai_risk_score: 84, ai_insight: "Disputed one invoice; send the signed challan.", broken_promises_count: 3, active_promise_date: d(-3) },
  { id: "c5", name: "Om Sai Kirana", phone: "9090909090", email: null, category: "Retail", total_outstanding: 38900, overdue_days: 12, risk_level: "Low", ai_risk_score: 18, ai_insight: null, broken_promises_count: 0, active_promise_date: null },
  { id: "c6", name: "Mehta Industrial Supply", phone: "9822001144", email: null, category: "Industrial", total_outstanding: 126450, overdue_days: 0, risk_level: "Low", ai_risk_score: 22, ai_insight: null, broken_promises_count: 0, active_promise_date: null },
];

const inv = (id: string, customer_id: string, invoice_no: string, amount: number, due: number, raised: number, status: InvoiceRow["status"] = "Pending"): InvoiceRow => ({
  id, customer_id, invoice_no, amount, due_date: d(due), status, invoice_date: d(raised), created_at: `${d(raised)}T10:00:00Z`,
});

const invoices: InvoiceRow[] = [
  inv("i1", "c1", "GKE/25-26/0142", 286500, -112, -142, "Overdue"),
  inv("i2", "c1", "GKE/25-26/0188", 200000, -95, -125, "Overdue"),
  inv("i3", "c2", "GKE/25-26/0201", 212000, -74, -104),
  inv("i4", "c3", "GKE/25-26/0233", 98400, -41, -71),
  inv("i5", "c3", "GKE/25-26/0260", 60000, -18, -48),
  inv("i6", "c4", "GKE/25-26/0177", 342750, -96, -126, "Overdue"),
  inv("i7", "c5", "GKE/25-26/0291", 38900, -12, -42),
  inv("i8", "c6", "GKE/25-26/0302", 126450, 9, -21),
  inv("i9", "c2", "GKE/25-26/0120", 175000, -150, -180, "Paid"),
  inv("i10", "c5", "GKE/25-26/0270", 64000, -30, -60, "Paid"),
  // Settled sales from the last quarter: DSO is measured against these.
  inv("i11", "c6", "GKE/25-26/0244", 412000, -40, -70, "Paid"),
  inv("i12", "c3", "GKE/25-26/0251", 268500, -35, -65, "Paid"),
  inv("i13", "c5", "GKE/25-26/0276", 186000, -20, -50, "Paid"),
  inv("i14", "c2", "GKE/25-26/0284", 534000, -15, -45, "Paid"),
  inv("i15", "c6", "GKE/25-26/0297", 377250, -5, -35, "Paid"),
  inv("i16", "c1", "GKE/25-26/0305", 295000, 10, -20, "Paid"),
];

const at = (daysAgo: number, time = "09:30:00") => `${d(-daysAgo)}T${time}+05:30`;

const commitment = (
  id: string,
  customer_id: string,
  interaction_type: CommitmentRow["interaction_type"],
  amount: number | null,
  daysAgo: number,
  notes: string,
  status: CommitmentRow["status"] = "kept",
  promisedInDays: number | null = null,
): CommitmentRow => ({
  id,
  customer_id,
  interaction_type,
  promised_amount: amount,
  promised_date: promisedInDays === null ? null : d(promisedInDays),
  notes,
  status,
  audio_url: null,
  created_at: at(daysAgo, "11:15:00"),
});

// Newest first, like the live query.
const commitments: CommitmentRow[] = [
  commitment("m9", "c2", "Promise to Pay", 212000, 0, "Owner ne bola aaj shaam tak transfer kar denge. Calm tone, confirmed the amount.", "pending", 0),
  commitment("m8", "c3", "Promise to Pay", 98400, 1, "Accounts team ne bataya 1 Nov ko cheque clear hoga. Asked for a fresh statement.", "pending", 6),
  commitment("m7", "c4", "Dispute", null, 2, "Says invoice 0177 had 6 damaged cartons; wants a credit note before paying the rest. Irritated.", "pending"),
  commitment("m6", "c1", "No Response", null, 3, "Called twice at 11:00 and 18:30, no answer. WhatsApp delivered, not read.", "pending"),
  commitment("m4", "c1", "Paid", 175000, 4, "Received ₹1,75,000 by NEFT against 0120.", "kept"),
  commitment("m2", "c5", "Paid", 64000, 6, "Paid in full by UPI after the second reminder.", "kept"),
  commitment("m1", "c3", "Partial Payment", 85000, 9, "Part payment ₹85,000 received; balance promised next week.", "kept"),
  commitment("m0", "c4", "Promise to Pay", 342750, 21, "Sir ne kaha tha 5 din pehle payment kar denge, abhi tak nahi aaya.", "broken", -16),
  commitment("mA", "c1", "Promise to Pay", 200000, 38, "Promised after Diwali stock clearance.", "broken", -30),
  commitment("mB", "c5", "Promise to Pay", 64000, 45, "Will pay by month end.", "kept", -40),
];

const reminder = (id: string, invoice_id: string, stage: 1 | 2 | 3, channel: "whatsapp" | "email", daysAgo: number, time: string): ReminderEventRow => ({
  id,
  invoice_id,
  stage,
  channel,
  created_by: null,
  created_at: at(daysAgo, time),
});

const reminders: ReminderEventRow[] = [
  reminder("r12", "i1", 3, "whatsapp", 0, "10:05:00"),
  reminder("r11", "i6", 3, "whatsapp", 0, "10:04:00"),
  reminder("r10", "i3", 2, "whatsapp", 1, "10:02:00"),
  reminder("r9", "i4", 2, "email", 1, "10:01:00"),
  reminder("r8", "i7", 1, "whatsapp", 2, "10:00:00"),
  reminder("r7", "i5", 1, "whatsapp", 3, "10:00:00"),
  reminder("r6", "i2", 3, "email", 4, "10:00:00"),
  reminder("r5", "i2", 2, "whatsapp", 9, "10:00:00"),
  reminder("r4", "i3", 1, "whatsapp", 12, "10:00:00"),
  reminder("r3", "i1", 2, "whatsapp", 15, "10:00:00"),
];

const members: TenantMemberRow[] = [
  { id: "tm1", email: "accounts@gke.in", role: "member", status: "active", invited_at: at(60) },
  { id: "tm2", email: "ca.sharma@gmail.com", role: "viewer", status: "invited", invited_at: at(3) },
];

const recoveryPlan: RecoveryPlanRow[] = customers
  .filter((c) => c.total_outstanding > 0 && (c.active_promise_date ? c.active_promise_date <= d(0) : c.risk_level === "High"))
  .map((c) => {
    const rank = c.active_promise_date === d(0) ? 1 : c.active_promise_date ? 2 : 3;
    const queue_reason = rank === 1 ? "promised_today" : rank === 2 ? "broken_promise" : "high_risk_overdue";
    return { customer_id: c.id, name: c.name, phone: c.phone, risk_level: c.risk_level, ai_risk_score: c.ai_risk_score, total_outstanding: c.total_outstanding, overdue_days: c.overdue_days, active_promise_date: c.active_promise_date, broken_promises_count: c.broken_promises_count, ai_insight: c.ai_insight, queue_reason, priority_rank: rank } as RecoveryPlanRow;
  })
  .sort((a, b) => a.priority_rank - b.priority_rank || b.total_outstanding - a.total_outstanding);

export const mockSnapshot: DashboardSnapshot = {
  tenant: {
    id: "t-demo",
    business_name: "Ganesh & Kartike Electronics",
    owner_phone: "9810012345",
    auth_user_id: "demo-owner",
    plan: "growth",
    upi_id: "gke@okicici",
    bank_details: "HDFC Bank · A/c 50200012345678 · IFSC HDFC0001234",
    udyam_number: "UDYAM-DL-06-0012345",
    udyam_category: "small",
    udyam_registered_on: "2023-04-12",
    is_suspended: false,
    created_at: at(200),
  },
  customers,
  invoices,
  commitments,
  reminders,
  members,
  recoveryPlan,
  fetchedAt: new Date().toISOString(),
};
