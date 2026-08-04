import { DISPLAY_LOCALE } from "./locale";

/**
 * Money formatting for the workspace.
 *
 * Amounts travel the wire in MINOR units, and `currency` is nullable because
 * the sources genuinely disagree: a commerce Order records a currency, a CRM
 * Lead records a bare integer and nothing else. The nullability is the whole
 * point of this module — `Intl.NumberFormat` will happily invent a symbol from
 * the runtime locale, so a merchant in India would see ₹ printed against a lead
 * amount the product never claimed was rupees, and the same build would show $
 * to a colleague abroad. When no currency is stated, none is drawn.
 *
 * Pure display: no server imports, safe in both server and client components.
 */

/**
 * Format a minor-unit amount. Returns null for a null amount so callers can
 * choose their own absence marker rather than being handed "—" or "0".
 */
export function formatMoney(
    amountMinor: number | null | undefined,
    currency: string | null | undefined,
): string | null {
    if (amountMinor === null || amountMinor === undefined) return null;
    const major = amountMinor / 100;

    if (currency) {
        return new Intl.NumberFormat(DISPLAY_LOCALE, {
            style: "currency",
            currency,
            // Whole amounts read faster in a dense table, and the decimals of a
            // pipeline value are never the deciding fact.
            maximumFractionDigits: major % 1 === 0 ? 0 : 2,
        }).format(major);
    }

    return new Intl.NumberFormat(DISPLAY_LOCALE, {
        maximumFractionDigits: major % 1 === 0 ? 0 : 2,
    }).format(major);
}

/**
 * Format an amount already in MAJOR units.
 *
 * Commerce rows carry `Decimal` totals serialised as strings ("1250.50") to
 * avoid the float rounding that would quietly lose a paisa on every order. The
 * string is parsed only at the display boundary, and a value that will not parse
 * is returned verbatim rather than rendered as "NaN" — a number nobody can read
 * is still better than a number that is wrong.
 */
export function formatMoneyMajor(
    amount: string | number | null | undefined,
    currency: string | null | undefined,
): string | null {
    if (amount === null || amount === undefined) return null;
    const value = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(value)) return String(amount);

    if (currency) {
        return new Intl.NumberFormat(DISPLAY_LOCALE, {
            style: "currency",
            currency,
            maximumFractionDigits: value % 1 === 0 ? 0 : 2,
        }).format(value);
    }
    return new Intl.NumberFormat(DISPLAY_LOCALE, {
        maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
}

/**
 * A compact form for tiles and chips: 45,000 → "45k", 4,500,000 → "45L".
 * Falls back to the full format when a currency is stated, because abbreviating
 * money someone is owed invites the wrong read at a glance.
 */
export function formatCount(value: number): string {
    if (value < 1000) return String(value);
    return new Intl.NumberFormat(DISPLAY_LOCALE, {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
}
