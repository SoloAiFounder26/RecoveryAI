/** Digits-only 10-digit Indian mobile from whatever the user typed, or null. */
export function parseIndianMobile(input: string): string | null {
  const d = input.replace(/\D/g, "");
  const ten = d.length === 12 && d.startsWith("91") ? d.slice(2) : d.length === 11 && d.startsWith("0") ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

export const toE164 = (tenDigit: string) => `+91${tenDigit}`;

/** "98123 45678" */
export function formatMobile(tenDigit: string) {
  return `${tenDigit.slice(0, 5)} ${tenDigit.slice(5)}`;
}
