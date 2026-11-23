import { formatMoney } from "@/lib/format/money";

/**
 * A service's price in a picker or card row, the same everywhere (round 3):
 * "No price" when none is set, "Free" for a price of 0 (DEC-172), else the
 * amount. Never "Free" for a missing price.
 */
export function servicePriceWords(
    priceCents: number | null | undefined,
    currency: string | null | undefined,
): string {
    if (priceCents == null) return "No price";
    return priceCents === 0
        ? "Free"
        : formatMoney(priceCents, currency ?? null);
}
