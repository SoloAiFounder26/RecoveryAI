/** Indian digit grouping: 1234567.5 -> "12,34,567.50". Hermes-safe (no Intl dependency). */
export function groupINR(value: number, decimals = 0): string {
  const sign = value < 0 ? "-" : "";
  const [whole, frac] = Math.abs(value).toFixed(decimals).split(".");
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  const grouped = rest ? `${rest},${last3}` : last3;
  return sign + grouped + (frac ? `.${frac}` : "");
}

export function formatINR(value: number, decimals = 0): string {
  return `₹${groupINR(value, decimals)}`;
}

/** Compact form for cards: ₹4.2L, ₹1.1Cr, ₹86K. */
export function formatINRCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${trim(value / 1e7)}Cr`;
  if (abs >= 1e5) return `₹${trim(value / 1e5)}L`;
  if (abs >= 1e3) return `₹${trim(value / 1e3)}K`;
  return formatINR(value);
}

function trim(n: number) {
  return n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, "");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Parse a Postgres `date` (YYYY-MM-DD) as a *local* calendar day, never UTC. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local calendar day -> YYYY-MM-DD. `toISOString()` would shift IST dates back a day. */
export function toISODate(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** "5 Nov" */
export function formatDayMonth(date: Date | string): string {
  const d = typeof date === "string" ? parseISODate(date) : date;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Wed, 5 Nov" */
export function formatWeekdayDayMonth(date: Date): string {
  return `${DAYS[date.getDay()]}, ${formatDayMonth(date)}`;
}

/** "5th Nov" — used in the commitment copy ("I will pay on 5th Nov"). */
export function formatOrdinalDayMonth(date: Date): string {
  const d = date.getDate();
  const suffix = d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";
  return `${d}${suffix} ${MONTHS[date.getMonth()]}`;
}
