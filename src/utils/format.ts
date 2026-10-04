/**
 * Formats a number as Indian Rupees with lakh/crore grouping, e.g. 870000 -> "₹ 8,70,000".
 * Implemented by hand so it behaves the same on Hermes, JSC and web.
 */
export function formatINR(amount: number, { space = true }: { space?: boolean } = {}): string {
  const negative = amount < 0;
  const digits = Math.round(Math.abs(amount)).toString();
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree : lastThree;
  return `${negative ? '-' : ''}₹${space ? ' ' : ''}${grouped}`;
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}
