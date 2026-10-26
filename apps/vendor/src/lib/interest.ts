// Ported verbatim from the RecoveryAI web app (recovery-ai/lib/interest.ts) so the app applies the same rules.
// MSMED Act, 2006 s.15–16 interest estimate.
//  - s.15: payment due by the agreed date, at most 45 days after acceptance
//    (15 days if nothing was agreed).
//  - s.16: interest on the overdue amount at three times the RBI Bank Rate,
//    compounded with monthly rests.
// This is an ESTIMATE for the dashboard, not a legal computation. The bank
// rate is an input because it changes; callers must let the user set it.

const MS_DAY = 86_400_000;

function utc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((utc(toIso) - utc(fromIso)) / MS_DAY);
}

function addDays(iso: string, days: number): string {
  return new Date(utc(iso) + days * MS_DAY).toISOString().slice(0, 10);
}

/** Date from which s.16 interest runs. */
export function appointedDay(dueDate: string, invoiceDate?: string | null): string {
  if (!invoiceDate) return dueDate;
  const cap = addDays(invoiceDate, 45);
  return dueDate < cap ? dueDate : cap;
}

export interface InterestResult {
  daysOverdue: number;
  annualRatePct: number;
  interest: number;
  total: number;
}

export function computeMsmedInterest(opts: {
  principal: number;
  dueDate: string;
  invoiceDate?: string | null;
  asOf: string;
  bankRatePct: number;
}): InterestResult {
  const start = appointedDay(opts.dueDate, opts.invoiceDate);
  const days = Math.max(0, daysBetween(start, opts.asOf));
  const annualRatePct = opts.bankRatePct * 3;
  if (days === 0 || opts.principal <= 0 || annualRatePct <= 0) {
    return { daysOverdue: days, annualRatePct, interest: 0, total: opts.principal };
  }
  const monthly = annualRatePct / 100 / 12;
  const wholeMonths = Math.floor(days / 30);
  const residualDays = days - wholeMonths * 30;
  const compounded = opts.principal * Math.pow(1 + monthly, wholeMonths);
  const total = compounded * (1 + (annualRatePct / 100) * (residualDays / 365));
  const interest = Math.round((total - opts.principal) * 100) / 100;
  return {
    daysOverdue: days,
    annualRatePct,
    interest,
    total: Math.round((opts.principal + interest) * 100) / 100,
  };
}
