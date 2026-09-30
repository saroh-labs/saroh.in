/**
 * Every price a merchant's site shows, one way (DEC-073 #11): a whole amount
 * without decimals ("₹500", "₹1,099"), anything else with two ("₹499.50"),
 * as the Customer Site design writes prices. Services, plans, packs,
 * products, the bag and checkout all come through here, through the
 * helpers their modules already export (`formatPrice`, `formatAmount`,
 * `formatMoney`, `accountMoney`).
 *
 * `locale` is Intl's default when omitted (the visitor's); callers pin
 * "en-IN" where the page has always used it. Null for a currency Intl
 * doesn't know, or an amount that isn't a number: better no price than a
 * wrong one, and each caller says what it shows instead.
 */
export function siteMoney(
    amount: number,
    currency: string,
    locale?: string,
): string | null {
    if (!Number.isFinite(amount) || !currency) return null;
    // Whole to the paisa: 499.999999 from a float is still 500.
    const whole = Math.round(amount * 100) % 100 === 0;
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            minimumFractionDigits: whole ? 0 : 2,
            maximumFractionDigits: whole ? 0 : 2,
        }).format(amount);
    } catch {
        return null;
    }
}
