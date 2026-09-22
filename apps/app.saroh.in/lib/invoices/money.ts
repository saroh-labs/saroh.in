import { DISPLAY_LOCALE } from "@/lib/format/locale";

/**
 * An invoice amount, always with its two decimals: "₹2,400.00".
 *
 * The workspace's `formatMoneyMajor` drops ".00" to keep dense tables quick
 * to scan; an invoice is a document someone pays from, and "₹2,400" beside
 * "₹396.50" reads as two kinds of number. Amounts arrive as decimal strings
 * the API computed; nothing is summed here.
 */
export function invoiceMoney(amount: string, currency: string): string {
    const value = Number(amount);
    if (!Number.isFinite(value)) return amount;
    return new Intl.NumberFormat(DISPLAY_LOCALE, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

/** What an invoice is for, from its first line: "Personal training × 4", "… + 2 more". */
export function forWhat(
    summary: {
        description: string;
        quantity: number;
        lineCount: number;
    } | null,
): string {
    if (!summary) return "No lines yet";
    const more = summary.lineCount - 1;
    if (more > 0) return `${summary.description} + ${more} more`;
    return summary.quantity > 1
        ? `${summary.description} × ${summary.quantity}`
        : summary.description;
}
