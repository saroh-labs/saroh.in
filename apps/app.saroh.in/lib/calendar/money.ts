import { currencySymbol, formatMoneyMajor } from "@/lib/format/money";

/**
 * The calendar's money: decimal strings from the API, summed in minor units so
 * a paisa is never lost to a float, and drawn two ways — whole in the panel and
 * the summary, short in a day's cell, where "₹14.7k" has to fit beside the
 * date on a phone-width column.
 */

/** "1250.50" → 125050. */
export function fromMajor(amount: string): number {
    const value = Number(amount);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** "1250.50" → 1250.5. */
export function toMajor(amount: string): number {
    return fromMajor(amount) / 100;
}

/** "₹29,180" — the full amount, for the summary and the day panel. */
export function wholeMoney(amount: number, currency: string): string {
    return formatMoneyMajor(Math.round(amount), currency) ?? "";
}

/** "₹3.8k", "₹960" — a day cell's takings, as the design writes them. */
export function shortMoney(amount: number, currency: string): string {
    const sign = currencySymbol(currency);
    if (amount >= 1000) return `${sign}${Math.round(amount / 100) / 10}k`;
    return `${sign}${Math.round(amount)}`;
}
