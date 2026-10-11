/**
 * A location's tax rate, as Payments says it in its row and checks it in
 * its Edit sheet. Pure.
 */

/** A percentage from 0 to 100 with up to 2 decimals, as the API takes it. */
export function taxRateValid(typed: string): boolean {
    return /^\d{1,2}(\.\d{1,2})?$|^100$/.test(typed.trim());
}

/** The saved rate as the field starts: "18.00" → "18", "12.50" → "12.5". */
export function taxRateField(saved: string): string {
    return String(Number(saved));
}

/** The row's sentence: "18% of each order's items, before delivery". */
export function taxRateSays(saved: string): string {
    return `${taxRateField(saved)}% of each order's items, before delivery`;
}
