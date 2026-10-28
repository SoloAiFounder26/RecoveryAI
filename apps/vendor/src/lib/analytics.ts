import { addDays, formatDayMonth, startOfToday, toISODate } from "@/lib/format";
import { computeMsmedInterest, daysBetween } from "@/lib/interest";
import { checkStatutoryEligibility, type UdyamProfile } from "@/lib/plans";
import type { DashboardSnapshot } from "@/types/vendor";

// The web app's Analytics screen (recovery-ai/components/screens/AnalyticsScreen.tsx and
// lib/aging.ts), computed from the same snapshot the rest of the app uses.

export const AGING_BUCKETS = ["Not due", "1–30", "31–60", "61–90", "90+"] as const;
export type WebAgingBucket = (typeof AGING_BUCKETS)[number];

export function bucketFor(daysLate: number): WebAgingBucket {
  if (daysLate <= 0) return "Not due";
  if (daysLate <= 30) return "1–30";
  if (daysLate <= 60) return "31–60";
  if (daysLate <= 90) return "61–90";
  return "90+";
}

const emptyBuckets = (): Record<WebAgingBucket, number> => ({ "Not due": 0, "1–30": 0, "31–60": 0, "61–90": 0, "90+": 0 });

export interface Payment {
  amount: number;
  at: Date;
}

/** Money received: Paid / Partial Payment outcomes with an amount (as /api/customers reports). */
export function paymentsOf(s: DashboardSnapshot): Payment[] {
  return s.commitments
    .filter((c) => (c.interaction_type === "Paid" || c.interaction_type === "Partial Payment") && Number(c.promised_amount) > 0)
    .map((c) => ({ amount: Number(c.promised_amount), at: new Date(c.created_at) }));
}

/** Cumulative payments over the last 30 days, sampled at 5 points; [] when nothing was received. */
export function recoveryTrend(payments: Payment[], today = startOfToday()) {
  const end = addDays(today, 1);
  const start = addDays(end, -30);
  const inWindow = payments.filter((p) => p.at >= start && p.at < end);
  if (inWindow.length === 0) return [];
  return [0, 7, 14, 21, 30].map((offset) => {
    const cutoff = addDays(start, offset);
    return { label: formatDayMonth(offset === 30 ? today : cutoff), value: inWindow.filter((p) => p.at < cutoff || offset === 30).reduce((t, p) => t + p.amount, 0) };
  });
}

export function monthSummary(payments: Payment[], outstanding: number, today = startOfToday()) {
  const thisStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const sum = (from: Date, to: Date) => payments.filter((p) => p.at >= from && p.at < to).reduce((t, p) => t + p.amount, 0);
  const recovered = sum(thisStart, addDays(today, 1));
  const lastMonth = sum(lastStart, thisStart);
  const recoverable = recovered + outstanding;
  return {
    recovered,
    deltaPct: lastMonth > 0 ? Math.round(((recovered - lastMonth) / lastMonth) * 100) : null,
    recoveryRate: recoverable > 0 ? Math.round((recovered / recoverable) * 100) : 0,
  };
}

export interface AgingRow {
  customerId: string;
  name: string;
  total: number;
  buckets: Record<WebAgingBucket, number>;
}

export function agingReport(s: DashboardSnapshot, today = toISODate(startOfToday())) {
  const totals = emptyBuckets();
  const byCustomer = new Map<string, AgingRow>();
  const names = new Map(s.customers.map((c) => [c.id, c.name]));
  for (const inv of s.invoices) {
    if (inv.status === "Paid") continue;
    const b = bucketFor(daysBetween(inv.due_date, today));
    const amount = Number(inv.amount);
    totals[b] += amount;
    const row = byCustomer.get(inv.customer_id) ?? { customerId: inv.customer_id, name: names.get(inv.customer_id) ?? "Customer", total: 0, buckets: emptyBuckets() };
    row.buckets[b] += amount;
    row.total += amount;
    byCustomer.set(inv.customer_id, row);
  }
  const rows = [...byCustomer.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  return { totals, rows, grand: AGING_BUCKETS.reduce((t, b) => t + totals[b], 0) };
}

/** MSMED s.16 interest per eligible overdue invoice (an estimate, as on the web dashboard). */
export function interestLines(s: DashboardSnapshot, profile: UdyamProfile, bankRatePct: number, today = toISODate(startOfToday())) {
  if (!checkStatutoryEligibility(profile).eligible || !(bankRatePct > 0)) return [];
  const names = new Map(s.customers.map((c) => [c.id, c.name]));
  return s.invoices
    .filter((i) => i.status !== "Paid" && daysBetween(i.due_date, today) > 0)
    .filter((i) => checkStatutoryEligibility(profile, i.invoice_date).eligible)
    .map((i) => ({
      key: i.id,
      name: names.get(i.customer_id) ?? "Customer",
      invoiceNo: i.invoice_no,
      ...computeMsmedInterest({ principal: Number(i.amount), dueDate: i.due_date, invoiceDate: i.invoice_date, asOf: today, bankRatePct }),
    }))
    .filter((l) => l.interest > 0)
    .sort((a, b) => b.interest - a.interest);
}
