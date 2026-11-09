/**
 * How a site groups an amount: lakh and crore for rupees, thousands otherwise.
 * One renderer serves both editions, and a business sells in one currency.
 */
export const moneyLocaleOf = (currency: string | null | undefined) =>
    currency === "INR" ? "en-IN" : "en-US";

/**
 * Every price a merchant's site shows, one way (DEC-073 #11): a whole amount
 * without decimals ("₹500", "₹1,099"), anything else with two ("₹499.50"),
 * as the Customer Site design writes prices. Services, plans, packs,
 * products, the bag and checkout all come through here, through the
 * helpers their modules already export (`formatPrice`, `formatAmount`,
 * `formatMoney`, `accountMoney`).
 *
 * Always in the business's own format, never the visitor's: `locale`
 * defaults to {@link moneyLocaleOf} its currency, so a US business's $20
 * reads "$20" to a browser set to en-IN too, as in the workspace. Null for a
 * currency Intl doesn't know, or an amount that isn't a number: better no
 * price than a wrong one, and each caller says what it shows instead.
 */
export function siteMoney(
    amount: number,
    currency: string,
    locale = moneyLocaleOf(currency),
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

/**
 * A decimal string from the API as the site shows it, in its currency's
 * locale unless told otherwise; the string itself when it can't be formatted. Here, not
 * in the "use client" product page, so a server component can call it: the
 * order confirmation page crashed for every buyer when it called the
 * client copy (UX-001).
 */
export function formatAmount(
    amount: string,
    currency: string,
    locale = moneyLocaleOf(currency),
): string {
    // "₹2,499", "₹24.50" (DEC-073 #11): never "₹24.5".
    return siteMoney(Number(amount), currency, locale) ?? amount;
}
