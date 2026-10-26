// Ported verbatim from the RecoveryAI web app (recovery-ai/lib/cadence.ts) so the app applies the same rules.
// Reminder cadence: an unpaid, overdue invoice moves through three stages by
// days past due. The queue offers each stage once; the user sends it (nothing
// is sent automatically) and records it, which hides that stage.

export type CadenceStage = 1 | 2 | 3;

export const STAGE_LABEL: Record<CadenceStage, string> = {
  1: "Gentle nudge",
  2: "Follow-up",
  3: "Final notice",
};

export function stageForDaysOverdue(days: number): CadenceStage | null {
  if (days < 1) return null;
  if (days <= 15) return 1;
  if (days <= 30) return 2;
  return 3;
}

export interface QueueItem {
  invoiceId: string;
  customerId: string;
  customerName: string;
  invoiceNo: string;
  amount: number;
  daysOverdue: number;
  stage: CadenceStage;
  stageLabel: string;
}

export interface OverdueInvoiceRow {
  id: string;
  customerId: string;
  customerName: string;
  invoiceNo: string;
  amount: number;
  daysOverdue: number;
}

/**
 * Turns overdue invoices + the set of already-sent "invoiceId:stage" keys into
 * the queue: each invoice appears once, at its current stage, unless that
 * stage was already sent. Most urgent first (later stage, then larger amount).
 */
export function buildQueue(rows: OverdueInvoiceRow[], sent: Set<string>): QueueItem[] {
  const queue: QueueItem[] = [];
  for (const r of rows) {
    const stage = stageForDaysOverdue(r.daysOverdue);
    if (!stage || sent.has(`${r.id}:${stage}`)) continue;
    queue.push({
      invoiceId: r.id,
      customerId: r.customerId,
      customerName: r.customerName,
      invoiceNo: r.invoiceNo,
      amount: r.amount,
      daysOverdue: r.daysOverdue,
      stage,
      stageLabel: STAGE_LABEL[stage],
    });
  }
  queue.sort((a, b) => b.stage - a.stage || b.amount - a.amount);
  return queue;
}
