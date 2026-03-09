/**
 * Convert a dollar amount to minor units (cents).
 */
export function toMinorUnits(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Format a cents amount as a display string, e.g. "$4.50".
 */
export function toDisplayAmount(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

/**
 * Calculate GST component from a GST-inclusive price.
 * Australian GST is 10%, so GST = price / 11.
 */
export function calculateGST(priceIncGST: number): number {
  return priceIncGST / 11;
}

/**
 * Round to the nearest 5 cents (Australian cash rounding rules).
 *
 * 1-2c → round down to 0
 * 3-4c → round up to 5
 * 6-7c → round down to 5
 * 8-9c → round up to 0 (next 10c)
 */
export function roundToFiveCents(amount: number): number {
  return Math.round(amount * 20) / 20;
}
