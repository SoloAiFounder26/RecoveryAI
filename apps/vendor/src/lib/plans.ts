// Ported verbatim from the RecoveryAI web app (recovery-ai/lib/plans.ts) so the app applies the same rules.
// Single source of truth for what each pricing tier includes. Pure (no server
// imports) so API routes enforce it and the UI reflects it from the same data.
// The monthly invoice limits are also enforced inside the database
// (fn_plan_invoice_limit) — keep the numbers in sync with the migration.

export type PlanId = "free" | "pro" | "growth";
export type MemberRole = "owner" | "member" | "viewer";
export type Tone = "friendly" | "professional" | "firm";
export type Channel = "whatsapp" | "email";

export interface PlanSpec {
  id: PlanId;
  name: string;
  price: string;
  /** List price per month in rupees (0 = free). Used for admin MRR bookkeeping. */
  monthlyInr: number;
  /** Max invoices added per calendar month (IST); null = unlimited. */
  invoicesPerMonth: number | null;
  bulkImport: boolean;
  /** Queue of due reminders (Day 1 / Day 16 / Day 31+ stages). */
  reminderCadence: boolean;
  /** Support requests are flagged for faster handling. */
  prioritySupport: boolean;
  upiLinks: boolean;
  /** Email drafts beyond the friendly tone. */
  allEmailTones: boolean;
  statutoryNotices: boolean;
  agingDashboard: boolean;
  /** Total seats including the owner. */
  seats: number;
}

export const PLANS: Record<PlanId, PlanSpec> = {
  free: {
    id: "free",
    name: "Free Starter",
    price: "₹0",
    monthlyInr: 0,
    invoicesPerMonth: 3,
    bulkImport: false,
    reminderCadence: false,
    prioritySupport: false,
    upiLinks: false,
    allEmailTones: false,
    statutoryNotices: false,
    agingDashboard: false,
    seats: 1,
  },
  pro: {
    id: "pro",
    name: "Solo Pro",
    price: "₹499/mo",
    monthlyInr: 499,
    invoicesPerMonth: 15,
    bulkImport: true,
    reminderCadence: true,
    prioritySupport: false,
    upiLinks: true,
    allEmailTones: true,
    statutoryNotices: false,
    agingDashboard: false,
    seats: 1,
  },
  growth: {
    id: "growth",
    name: "MSME Growth",
    price: "₹1,499/mo",
    monthlyInr: 1499,
    invoicesPerMonth: null,
    bulkImport: true,
    reminderCadence: true,
    prioritySupport: true,
    upiLinks: true,
    allEmailTones: true,
    statutoryNotices: true,
    agingDashboard: true,
    seats: 3,
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return value === "free" || value === "pro" || value === "growth";
}

export function canWrite(role: MemberRole): boolean {
  return role === "owner" || role === "member";
}

export function upgradeMessage(feature: string, needed: PlanId): string {
  return `${feature} is available on the ${PLANS[needed].name} plan. Contact us to upgrade.`;
}

// ---------- Udyam / statutory eligibility ----------

export interface UdyamProfile {
  number: string | null;
  category: "micro" | "small" | "medium" | null;
  registeredOn: string | null; // YYYY-MM-DD
}

export const UDYAM_NUMBER_RE = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/;

export interface StatutoryCheck {
  eligible: boolean;
  /** Why not (shown to the user) when eligible is false. */
  reason: string | null;
}

/**
 * The MSMED Act payment protections and s.43B(h) apply only to Udyam-registered
 * MICRO or SMALL suppliers, and only for supplies made after registration.
 * Medium enterprises and unregistered suppliers must not send a statutory notice.
 */
export function checkStatutoryEligibility(
  profile: UdyamProfile,
  invoiceDate?: string | null
): StatutoryCheck {
  if (!profile.number || !UDYAM_NUMBER_RE.test(profile.number)) {
    return {
      eligible: false,
      reason: "Add your Udyam registration number in Business Profile to use statutory notices.",
    };
  }
  if (profile.category !== "micro" && profile.category !== "small") {
    return {
      eligible: false,
      reason:
        "MSMED Act payment protections apply only to Udyam micro and small suppliers. A firm payment reminder is used instead.",
    };
  }
  if (!profile.registeredOn) {
    return {
      eligible: false,
      reason: "Add your Udyam registration date in Business Profile; the Act covers only supplies made after it.",
    };
  }
  if (invoiceDate && invoiceDate < profile.registeredOn) {
    return {
      eligible: false,
      reason: "This invoice pre-dates your Udyam registration, so statutory remedies may not apply. A firm payment reminder is used instead.",
    };
  }
  return { eligible: true, reason: null };
}
