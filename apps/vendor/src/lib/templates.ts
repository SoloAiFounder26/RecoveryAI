// Ported verbatim from the RecoveryAI web app (recovery-ai/lib/templates.ts) so the app applies the same rules.
import type { Channel, Tone } from "./plans";

// Reminder / notice drafts. Pure and deterministic so the server can generate
// them under plan checks and tests can pin the wording.
// Statutory wording mirrors the product's landing page; it is a template, not
// legal advice, and should be reviewed by counsel before wide use.

export type Lang = "en" | "hi";

export interface DraftContext {
  businessName: string;
  customerName: string;
  invoiceNo: string;
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  daysOverdue: number;
  /** YYYY-MM-DD: date by which payment is requested in firm/statutory drafts. */
  deadline: string;
  upiLink?: string | null;
  bankDetails?: string | null;
}

export interface Draft {
  subject: string | null;
  body: string;
}

export function toneForDaysOverdue(days: number): Tone {
  if (days > 30) return "firm";
  if (days > 15) return "professional";
  return "friendly";
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmt(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** `upi://pay` deep link. Amount is fixed to the invoice so the payer cannot mistype it. */
export function buildUpiLink(upiId: string, payeeName: string, amount: number, invoiceNo: string): string {
  // pa stays un-encoded ("@" is valid and some UPI apps reject "%40"); the
  // route validates the VPA charset before it ever reaches here.
  const enc = encodeURIComponent;
  return `upi://pay?pa=${upiId}&pn=${enc(payeeName)}&am=${amount.toFixed(2)}&cu=INR&tn=${enc(`Invoice ${invoiceNo}`)}`;
}

function payBlock(c: DraftContext, lang: Lang): string {
  const lines: string[] = [];
  if (c.upiLink) lines.push(lang === "hi" ? `UPI से भुगतान: ${c.upiLink}` : `Pay via UPI: ${c.upiLink}`);
  if (c.bankDetails) lines.push(lang === "hi" ? `NEFT विवरण: ${c.bankDetails}` : `NEFT details: ${c.bankDetails}`);
  return lines.join("\n");
}

function join(parts: (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join("\n\n");
}

export function buildDraft(
  tone: Tone,
  channel: Channel,
  lang: Lang,
  c: DraftContext,
  statutory: boolean
): Draft {
  // Email drafts are English only; Hindi is offered for WhatsApp.
  const l: Lang = channel === "email" ? "en" : lang;
  const amt = inr(c.amount);
  const due = fmt(c.dueDate);
  const by = fmt(c.deadline);
  const pay = payBlock(c, l);
  const subject = `Pending Invoice ${c.invoiceNo} - ${c.customerName}`;

  const wrap = (greeting: string, paras: string[], signoff: string): Draft => {
    const body = join([greeting, ...paras, pay, signoff]);
    return { subject: channel === "email" ? subject : null, body };
  };

  if (tone === "friendly") {
    return l === "hi"
      ? wrap(
          `नमस्ते ${c.customerName} जी,`,
          [`आशा है आप ठीक होंगे। इनवॉइस ${c.invoiceNo} (${amt}) की देय तिथि ${due} थी। शायद यह आपकी नज़र से छूट गया हो — कृपया बताइए कि भुगतान कब तक हो पाएगा?`],
          `धन्यवाद,\n${c.businessName}`
        )
      : wrap(
          `Hi ${c.customerName},`,
          [`Hope the week is going well! A quick check-in on invoice ${c.invoiceNo} for ${amt}, due ${due} — it may have slipped through. Could you let us know when it is likely to go through?`],
          `Thanks so much,\n${c.businessName}`
        );
  }

  if (tone === "professional") {
    return l === "hi"
      ? wrap(
          `प्रिय ${c.customerName} जी,`,
          [`इनवॉइस ${c.invoiceNo} (${amt}) की देय तिथि ${due} थी और यह अब ${c.daysOverdue} दिन से बकाया है। कृपया शीघ्र भुगतान करें। भुगतान हो चुका हो तो UTR साझा करें।`],
          `सादर,\n${c.businessName}`
        )
      : wrap(
          `Dear ${c.customerName},`,
          [
            `This is a reminder that invoice ${c.invoiceNo} for ${amt} was due on ${due} and is now ${c.daysOverdue} days overdue. As per our agreed payment terms, we request you to clear the amount at the earliest.`,
            `If payment has already been made, please share the UTR so we can reconcile.`,
          ],
          `Regards,\n${c.businessName}`
        );
  }

  // firm
  if (statutory) {
    return l === "hi"
      ? wrap(
          `औपचारिक सूचना — ${c.customerName}`,
          [
            `इनवॉइस ${c.invoiceNo} (${amt}) देय तिथि ${due} के ${c.daysOverdue} दिन बाद भी अवैतनिक है। MSMED अधिनियम, 2006 की धारा 15 के अनुसार सूक्ष्म एवं लघु उद्यमों को भुगतान सहमत अवधि (अधिकतम 45 दिन) में करना आवश्यक है। आयकर अधिनियम की धारा 43B(h) के अनुसार विलंबित आपूर्तिकर्ता बकाया पर कटौती केवल वास्तविक भुगतान वाले वर्ष में मिलती है। लगातार देरी पर MSMED अधिनियम की धारा 16 के तहत चक्रवृद्धि ब्याज भी लगेगा।`,
            `कृपया ब्याज सहित बकाया ${by} तक चुकाएं।`,
          ],
          `${c.businessName}`
        )
      : wrap(
          `Dear ${c.customerName},`,
          [
            `FORMAL NOTICE. Despite earlier reminders, invoice ${c.invoiceNo} for ${amt} (due ${due}) remains unpaid, ${c.daysOverdue} days past its due date.`,
            `Under Section 15 of the MSMED Act, 2006, payment to micro and small enterprises must be made within the agreed period (maximum 45 days). Under Section 43B(h) of the Income Tax Act, buyers can claim income tax deduction for delayed supplier dues only in the year of actual payment. Continued delay also attracts compound interest under Section 16 of the MSMED Act, 2006.`,
            `Please clear the principal along with the applicable interest by ${by}. Failing this, we will pursue the remedies available under law, including a reference to the MSME Samadhaan portal.`,
          ],
          `Regards,\n${c.businessName}`
        );
  }

  return l === "hi"
    ? wrap(
        `अंतिम अनुस्मारक — ${c.customerName}`,
        [`इनवॉइस ${c.invoiceNo} (${amt}) देय तिथि ${due} के ${c.daysOverdue} दिन बाद भी अवैतनिक है। सहमत शर्तों के अनुसार कृपया ${by} तक पूरा भुगतान करें। कोई विवाद हो तो उससे पहले संपर्क करें।`],
        `${c.businessName}`
      )
    : wrap(
        `Dear ${c.customerName},`,
        [
          `FINAL REMINDER. Despite earlier reminders, invoice ${c.invoiceNo} for ${amt} (due ${due}) remains unpaid, ${c.daysOverdue} days past its due date.`,
          `As per the payment terms agreed between us, we request you to clear the full amount by ${by}. If there is any dispute or difficulty, please contact us before that date so we can resolve it.`,
          `Failing payment, we will have to pursue the remedies available under our agreement and applicable law.`,
        ],
        `Regards,\n${c.businessName}`
      );
}

export function draftToText(d: Draft): string {
  return d.subject ? `Subject: ${d.subject}\n\n${d.body}` : d.body;
}
