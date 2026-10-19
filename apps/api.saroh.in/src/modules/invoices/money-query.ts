import { MAX_CENTS, toCents } from "./totals";

/**
 * Whether what was typed in the Invoices search reads as an amount, and
 * which, in paise (DEC-173, invoices U4). "₹8,400", "8400", "8,400.00",
 * "Rs 8400" and "8,40,000" are amounts; "8,40" (a comma in the wrong place),
 * "8.400" (three decimals), "0" and anything with letters are not, and
 * then only the name and number matches apply.
 *
 * Commas are only taken where they group digits, the Indian way
 * (8,40,000) or the international way (840,000), so a half-typed number
 * never turns into a different amount.
 */

/** An optional rupee sign, "Rs", "Rs." or "INR" in front. */
const CURRENCY_MARK = /^(?:₹|rs\.?|inr)\s*/i;

/** Digits, no commas. */
const PLAIN = /^\d+$/;
/** 8,40,000: the last group three digits, the ones before it two. */
const INDIAN = /^\d{1,2}(?:,\d{2})*,\d{3}$/;
/** 840,000: groups of three. */
const INTERNATIONAL = /^\d{1,3}(?:,\d{3})+$/;
/** The whole part, then one or two decimals after a point, if any. */
const AMOUNT = /^([\d,]+)(?:\.(\d{1,2}))?$/;

/** The amount `q` names, in paise, or null when it isn't one. */
export function moneyQueryCents(q: string): number | null {
    const text = q.trim().replace(CURRENCY_MARK, "").trim();
    const match = AMOUNT.exec(text);
    if (!match) return null;
    const whole = match[1];
    const fraction: string | undefined = match[2];
    if (
        !PLAIN.test(whole) &&
        !INDIAN.test(whole) &&
        !INTERNATIONAL.test(whole)
    ) {
        return null;
    }
    const digits = whole.replace(/,/g, "");
    // Past what an invoice's total can hold, it can't be one.
    if (digits.length > 12) return null;
    const cents = toCents(fraction ? `${digits}.${fraction}` : digits);
    if (cents <= 0 || cents > MAX_CENTS) return null;
    return cents;
}
