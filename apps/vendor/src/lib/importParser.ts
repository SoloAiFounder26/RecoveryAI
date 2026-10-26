// Ported from the RecoveryAI web app (recovery-ai/lib/importParser.ts): same header aliases
// (Tally, Zoho Books, generic), date and amount rules, so a file that imports on the web imports
// here too. Only the file reading differs: the app hands in the picked file's bytes.
import * as XLSX from "xlsx";
import type { ImportCustomerPayload } from "@/lib/webApi";

export interface ParsedRow {
  rowNumber: number; // 1-based, matches spreadsheet row (header = row 1)
  customerName: string;
  phone: string;
  invoiceNo: string;
  amount: string;
  dueDate: string;
}

export interface ValidationIssue {
  row: number;
  issue: string;
  value: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  validRows: ParsedRow[];
  errors: ValidationIssue[];
  duplicates: ValidationIssue[];
}

// Flexible header aliases — real-world exports spell these differently.
// Includes the column names used by Tally (Bills Receivable / Outstanding
// Receivables export) and Zoho Books (Invoices / Receivables export).
const HEADER_ALIASES: Record<keyof Omit<ParsedRow, "rowNumber">, string[]> = {
  customerName: ["party", "party's name", "party name", "particulars", "customer name", "customer", "name"],
  phone: ["phone", "mobile", "contact", "phone number", "mobile phone", "customer phone", "mobile no", "mobile number"],
  invoiceNo: ["invoice no", "invoice number", "invoice#", "invoice", "inv no", "ref. no.", "ref no", "bill no", "bill ref"],
  amount: ["amount", "amt", "outstanding", "outstanding amount", "pending", "pending amount", "balance", "balance due"],
  dueDate: ["due date", "due on", "date", "due"],
};

export type ImportSource = "tally" | "zoho" | "generic";

function normHeader(h: string): string {
  return h.replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").replace(/:$/, "").trim().toLowerCase();
}

/** Best-effort guess at which accounting tool produced the file, from its headers. */
export function detectSource(headers: string[]): ImportSource {
  const h = new Set(headers.map(normHeader));
  if (h.has("party's name") || h.has("party name") || h.has("ref. no.") || h.has("due on") || h.has("pending")) {
    return "tally";
  }
  if (h.has("invoice number") && h.has("customer name") && (h.has("balance") || h.has("balance due"))) {
    return "zoho";
  }
  return "generic";
}

function matchHeader(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map(normHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

// SheetJS auto-detects date-like strings (including plain "dd-mm-yyyy" CSV
// text — exactly the format this app's own sample template uses) and, by
// default, silently converts them into raw Excel serial numbers like
// "46031.00011574074", which then fail every downstream date check. Reading
// with `cellDates: true` makes SheetJS hand back real Date objects for those
// cells instead — turn those back into "dd-mm-yyyy" text here (using UTC
// getters, since SheetJS anchors parsed dates at UTC midnight) so the rest
// of the pipeline sees the same plain string it would from a cell SheetJS
// didn't try to interpret.
function cellToDueDateString(value: unknown): string {
  if (value instanceof Date) {
    const day = String(value.getUTCDate()).padStart(2, "0");
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const year = value.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }
  return String(value ?? "").trim();
}

export interface WorkbookParse {
  rows: ParsedRow[];
  source: ImportSource;
  /** Required columns (name / amount / due date) the file has no header for. */
  missingColumns: string[];
}

const TOTAL_ROW_RE = /^(grand\s+)?total\b/i;

/** Finds the header row: Tally exports put a company name / report title above it. */
function findHeaderRow(grid: unknown[][]): number {
  const all = Object.values(HEADER_ALIASES).flat();
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const cells = grid[i].map((c) => normHeader(String(c ?? "")));
    const hits = (Object.values(HEADER_ALIASES) as string[][]).filter((aliases) =>
      aliases.some((a) => cells.includes(a))
    ).length;
    if (hits >= 2 && cells.some((c) => all.includes(c))) return i;
  }
  return 0;
}

export function parseWorkbookData(data: ArrayBuffer): WorkbookParse {
  // raw: true keeps CSV cells as typed text (no dd-mm vs mm-dd guessing); cellDates: true still
  // turns genuine .xlsx date cells into Dates. Same options as the web parser.
  const workbook = XLSX.read(new Uint8Array(data), { type: "array", cellDates: true, raw: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: "",
    blankrows: true,
  });

  if (grid.length === 0) return { rows: [], source: "generic", missingColumns: [] };

  const headerIdx = findHeaderRow(grid);
  const headers = grid[headerIdx].map((c) => String(c ?? "").trim());
  const source = detectSource(headers);
  const nameKey = matchHeader(headers, HEADER_ALIASES.customerName);
  const phoneKey = matchHeader(headers, HEADER_ALIASES.phone);
  const invoiceKey = matchHeader(headers, HEADER_ALIASES.invoiceNo);
  const amountKey = matchHeader(headers, HEADER_ALIASES.amount);
  const dueDateKey = matchHeader(headers, HEADER_ALIASES.dueDate);
  const col = (key: string | null) => (key ? headers.indexOf(key) : -1);
  const cell = (r: unknown[], key: string | null) => {
    const i = col(key);
    return i === -1 ? "" : r[i];
  };

  const rows: ParsedRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (r.every((c) => String(c ?? "").trim() === "")) continue; // blank row
    const customerName = String(cell(r, nameKey) ?? "").trim();
    if (TOTAL_ROW_RE.test(customerName)) continue; // Tally "Grand Total" footer
    rows.push({
      rowNumber: i + 1, // sheet row number (1-based)
      customerName,
      phone: String(cell(r, phoneKey) ?? "").trim(),
      invoiceNo: String(cell(r, invoiceKey) ?? "").trim(),
      amount: String(cell(r, amountKey) ?? "").trim(),
      dueDate: dueDateKey ? cellToDueDateString(cell(r, dueDateKey)) : "",
    });
  }
  const missingColumns = [
    !nameKey && "Customer Name",
    !amountKey && "Amount",
    !dueDateKey && "Due Date",
  ].filter((c): c is string => Boolean(c));
  return { rows, source, missingColumns };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function isoIfReal(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Strict date parser -> "YYYY-MM-DD", or null if the value is not a real
 * calendar date. Handles dd-mm-yyyy, dd/mm/yyyy, yyyy-mm-dd and Tally's
 * "15-Sep-2026" / "15-Sep-26". Never goes through the Date constructor for
 * these formats: new Date("15-Sep-2026") is local midnight, and toISOString()
 * would shift it back a day for anyone east of UTC (i.e. all of India).
 */
export function parseDateToISO(raw: string): string | null {
  const value = raw.trim();
  let m = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return isoIfReal(+m[3], +m[2], +m[1]);
  m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return isoIfReal(+m[1], +m[2], +m[3]);
  m = value.match(/^(\d{1,2})[-/ .]([A-Za-z]{3})[A-Za-z]*[-/ .,]*(\d{2}|\d{4})$/);
  if (m) {
    const mon = MONTHS.indexOf(m[2].toLowerCase());
    if (mon === -1) return null;
    const yr = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return isoIfReal(yr, mon + 1, +m[1]);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  // Local components (what the user typed), not UTC.
  return isoIfReal(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}

function isValidDate(value: string): boolean {
  return parseDateToISO(value) !== null;
}

function normalizedAmount(value: string): number | null {
  // Tally writes balances like "1,23,456.00 Dr".
  const cleaned = value.replace(/dr\.?$/i, "").replace(/[₹,\s]/g, "");
  if (cleaned === "" || Number.isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

/** 10-digit Indian mobile, tolerating "+91 ", "91" and a leading "0". */
export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function normalizeToISODate(value: string): string | null {
  return parseDateToISO(value);
}

export function validateRows(rows: ParsedRow[]): ParseResult {
  const errors: ValidationIssue[] = [];
  const duplicates: ValidationIssue[] = [];
  const seen = new Set<string>();
  const validRows: ParsedRow[] = [];

  for (const row of rows) {
    const digits = normalizePhone(row.phone);
    const rowErrors: ValidationIssue[] = [];

    if (!row.customerName) {
      rowErrors.push({ row: row.rowNumber, issue: "Missing customer name", value: "-" });
    }
    if (digits.length !== 10) {
      rowErrors.push({
        row: row.rowNumber,
        issue: row.phone ? "Invalid phone number" : "Phone number missing (add a Phone column)",
        value: row.phone || "-",
      });
    }
    if (!row.dueDate || !isValidDate(row.dueDate)) {
      rowErrors.push({
        row: row.rowNumber,
        issue: "Invalid date format",
        value: row.dueDate || "-",
      });
    }
    const amt = normalizedAmount(row.amount);
    if (amt === null || amt <= 0) {
      rowErrors.push({
        row: row.rowNumber,
        issue: "Invalid amount",
        value: row.amount || "-",
      });
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    // A customer legitimately appears on many rows (one per invoice); only an
    // identical invoice repeated is a duplicate.
    const invoiceKey = row.invoiceNo
      ? row.invoiceNo.toLowerCase()
      : `${normalizedAmount(row.amount)}@${normalizeToISODate(row.dueDate)}`;
    const key = `${row.customerName.toLowerCase()}|${digits}|${invoiceKey}`;
    if (seen.has(key)) {
      duplicates.push({
        row: row.rowNumber,
        issue: "Duplicate invoice",
        value: row.invoiceNo ? `${row.customerName} · ${row.invoiceNo}` : row.customerName,
      });
      continue;
    }
    seen.add(key);
    validRows.push(row);
  }

  return { rows, validRows, errors, duplicates };
}

// Groups valid rows by customer into the shape POST /api/import expects.
// Risk scoring now happens server-side (fn_recalculate_customer_metrics),
// so this only needs to normalize and group — no heuristics here.
export function buildImportPayload(rows: ParsedRow[]): ImportCustomerPayload[] {
  const byCustomer = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const digits = normalizePhone(row.phone);
    const key = `${row.customerName.toLowerCase()}|${digits}`;
    const bucket = byCustomer.get(key) ?? [];
    bucket.push(row);
    byCustomer.set(key, bucket);
  }

  return Array.from(byCustomer.values()).map((customerRows, idx) => {
    const first = customerRows[0];
    const digits = normalizePhone(first.phone);

    return {
      name: first.customerName,
      phone: digits,
      category: null,
      invoices: customerRows.map((row, i) => ({
        invoiceNo: row.invoiceNo || `INV-IMP-${idx}-${i}`,
        amount: normalizedAmount(row.amount) ?? 0,
        dueDate: normalizeToISODate(row.dueDate) ?? new Date().toISOString().slice(0, 10),
        status: "Pending" as const,
      })),
    };
  });
}

