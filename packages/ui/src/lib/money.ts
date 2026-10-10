/**
 * What a currency's sign is and how many decimal places it has: the one
 * answer for the box an amount is typed in (`MoneyInput`) and for the words
 * an amount is read in (the merchant app's `lib/format/money.ts`), so the
 * two can't disagree.
 *
 * A plain module, not a client one, so a server component can call it.
 */

/**
 * The locale every number and amount is grouped in: lakh and crore
 * ("₹20,44,971"), the way Saroh's merchants read money (DEC-079).
 */
export const MONEY_LOCALE = "en-IN";

/** The sign a currency is written with ("₹" for INR). */
export function moneySign(currency: string): string {
    try {
        const part = new Intl.NumberFormat(MONEY_LOCALE, {
            style: "currency",
            currency,
            currencyDisplay: "narrowSymbol",
        })
            .formatToParts(0)
            .find((p) => p.type === "currency");
        return part?.value ?? currency;
    } catch {
        return currency;
    }
}

/** How many decimal places a currency is written with (2 for INR, 0 for JPY). */
export function moneyDecimals(currency: string): number {
    try {
        return (
            new Intl.NumberFormat(MONEY_LOCALE, {
                style: "currency",
                currency,
            }).resolvedOptions().maximumFractionDigits ?? 2
        );
    } catch {
        return 2;
    }
}
