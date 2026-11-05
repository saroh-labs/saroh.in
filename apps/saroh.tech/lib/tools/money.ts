import type { GLOBAL_CURRENCIES } from "@saroh/edition";

/** Money in whole cents, so a total never drifts. The same nine as a Global business's setup. */
export const CURRENCIES: Record<
    (typeof GLOBAL_CURRENCIES)[number],
    { symbol: string; label: string }
> = {
    GBP: { symbol: "£", label: "GBP £" },
    USD: { symbol: "$", label: "USD $" },
    EUR: { symbol: "€", label: "EUR €" },
    AUD: { symbol: "A$", label: "AUD $" },
    CAD: { symbol: "C$", label: "CAD $" },
    NZD: { symbol: "NZ$", label: "NZD $" },
    SGD: { symbol: "S$", label: "SGD $" },
    AED: { symbol: "AED ", label: "AED" },
    ZAR: { symbol: "R", label: "ZAR R" },
};

export type Currency = keyof typeof CURRENCIES;

export const CURRENCY_OPTIONS = Object.entries(CURRENCIES).map(
    ([value, c]) => ({ value: value as Currency, label: c.label }),
);

/**
 * What someone typed, as a number: "1,200.50" and "$850" both work, and
 * anything that isn't a number is 0.
 * shortcut: reads "." as the decimal point, so "1.200,50" is wrong; add a
 * locale choice if people in those countries report it.
 */
export function parseNumber(value: string): number {
    const n = parseFloat(value.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

/** Half up, and 1.005 is 101 cents even though floats say otherwise. */
export const toCents = (amount: number) =>
    Math.round((amount + Number.EPSILON) * 100);

export function formatPlain(cents: number): string {
    return (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export const formatMoney = (cents: number, currency: Currency) =>
    `${CURRENCIES[currency].symbol}${formatPlain(cents)}`;
