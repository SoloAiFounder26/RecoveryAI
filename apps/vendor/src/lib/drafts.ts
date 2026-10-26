import { PLANS, checkStatutoryEligibility, upgradeMessage, type Channel, type Tone } from "@/lib/plans";
import { buildDraft, buildUpiLink, draftToText, type Lang } from "@/lib/templates";
import { daysBetween } from "@/lib/interest";
import { addDays, startOfToday, toISODate } from "@/lib/format";
import type { DraftResult } from "@/lib/webApi";
import type { CustomerRow, InvoiceRow, TenantRow } from "@/types/vendor";

/**
 * Same draft POST /api/drafts returns, built on the device for the sample login (which has no
 * server session). Mirrors the route's plan gates: email tones, UPI links and statutory notices.
 */
export function buildLocalDraft(
  tenant: TenantRow,
  customer: CustomerRow,
  invoice: InvoiceRow,
  opts: { tone: Tone; channel: Channel; lang: Lang },
): DraftResult {
  const plan = PLANS[tenant.plan];
  if (opts.channel === "email" && opts.tone !== "friendly" && !plan.allEmailTones) {
    throw new Error(upgradeMessage("Professional and firm email drafts", "pro"));
  }
  const today = startOfToday();
  const now = toISODate(today);
  const daysOverdue = Math.max(0, daysBetween(invoice.due_date, now));

  let statutory = false;
  let note: string | null = null;
  if (opts.tone === "firm") {
    if (!plan.statutoryNotices) {
      note = upgradeMessage("Statutory notices citing the MSMED Act and Section 43B(h)", "growth");
    } else {
      const check = checkStatutoryEligibility(
        { number: tenant.udyam_number, category: tenant.udyam_category, registeredOn: tenant.udyam_registered_on },
        invoice.invoice_date,
      );
      statutory = check.eligible;
      note = check.reason;
    }
  }

  const draft = buildDraft(
    opts.tone,
    opts.channel,
    opts.lang,
    {
      businessName: tenant.business_name,
      customerName: customer.name,
      invoiceNo: invoice.invoice_no,
      amount: invoice.amount,
      dueDate: invoice.due_date,
      daysOverdue,
      deadline: toISODate(addDays(today, 15)),
      upiLink: plan.upiLinks && tenant.upi_id ? buildUpiLink(tenant.upi_id, tenant.business_name, invoice.amount, invoice.invoice_no) : null,
      bankDetails: plan.upiLinks ? tenant.bank_details : null,
    },
    statutory,
  );
  return { ...draft, text: draftToText(draft), statutory, note, daysOverdue };
}
