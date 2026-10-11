import { moneyDecimals, moneySign } from "@saroh/ui/lib/money";
import { NUMBER_LOCALE } from "./locale";

/**
 * Money and numbers for the workspace: the one place an amount is turned
 * into words. `scripts/check-formats.mjs` fails an `Intl.NumberFormat` or
 * `toLocaleString` anywhere else in the app.
 *
 * The form (UX audit, 10 Oct 2026): the currency's own sign, Indian
 * grouping, and decimals only when there are any ("₹1,250", "₹1,250.50",
 * "₹20,44,971"). A ledger or an invoice column that needs its decimals in a
 * line asks for `{ decimals: "always" }` ("₹1,250.00").
 *
 * Amounts travel the wire in MINOR units, and `currency` is nullable because
 * the sources genuinely disagree: a commerce Order records a currency, a CRM
 * Lead records a bare integer and nothing else. `Intl.NumberFormat` will
 * happily invent a symbol from the runtime locale, so this module never
 * guesses: when no currency is passed, none is drawn. A lead's Worth is in
 * the business's currency (owner, 11 Oct 2026), so its screens pass
 * `readBusinessCurrency()` (`lib/organizations/business-currency.ts`), the
 * business's own and never the viewer's locale.
 *
 * Pure display: no server imports, safe in both server and client components.
 */

export interface MoneyOptions {
    /**
     * `auto` (the default) drops ".00" from a whole amount, which reads
     * faster in a dense table. `always` keeps two decimals, for a column of
     * amounts someone pays from or adds up.
     */
    decimals?: "auto" | "always";
}

function amountWords(
    major: number,
    currency: string | null | undefined,
    options: MoneyOptions | undefined,
): string {
    // As many places as the currency has: two for rupees, none for yen.
    const places = currency ? moneyDecimals(currency) : 2;
    const digits =
        options?.decimals === "always"
            ? { minimumFractionDigits: places, maximumFractionDigits: places }
            : { maximumFractionDigits: major % 1 === 0 ? 0 : places };
    return new Intl.NumberFormat(NUMBER_LOCALE, {
        ...(currency ? { style: "currency" as const, currency } : {}),
        ...digits,
    }).format(major);
}

/**
 * Format a minor-unit amount (paise in, "₹1,250" out). Returns null for a
 * null amount so callers can choose their own absence marker rather than
 * being handed "—" or "0".
 */
export function formatMoney(
    amountMinor: number,
    currency: string | null | undefined,
    options?: MoneyOptions,
): string;
export function formatMoney(
    amountMinor: number | null | undefined,
    currency: string | null | undefined,
    options?: MoneyOptions,
): string | null;
export function formatMoney(
    amountMinor: number | null | undefined,
    currency: string | null | undefined,
    options?: MoneyOptions,
): string | null {
    if (amountMinor === null || amountMinor === undefined) return null;
    return amountWords(amountMinor / 100, currency, options);
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
    amount: string | number,
    currency: string | null | undefined,
    options?: MoneyOptions,
): string;
export function formatMoneyMajor(
    amount: string | number | null | undefined,
    currency: string | null | undefined,
    options?: MoneyOptions,
): string | null;
export function formatMoneyMajor(
    amount: string | number | null | undefined,
    currency: string | null | undefined,
    options?: MoneyOptions,
): string | null {
    if (amount === null || amount === undefined) return null;
    const value = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(value)) return String(amount);
    return amountWords(value, currency, options);
}

/** A plain number, grouped as money is: 1204 → "1,204", 2044971 → "20,44,971". */
export function formatNumber(value: number): string {
    return new Intl.NumberFormat(NUMBER_LOCALE).format(value);
}

/**
 * A compact form for tiles and chips: 45,000 → "45K", 45,00,000 → "45L".
 * Never for money someone is owed: abbreviating it invites the wrong read
 * at a glance.
 */
export function formatCompact(value: number): string {
    if (value < 1000) return String(value);
    return new Intl.NumberFormat(NUMBER_LOCALE, {
        notation: "compact",
        maximumFractionDigits: 1,
    }).format(value);
}

/**
 * The sign a currency is written with ("₹" for INR), and how many decimal
 * places it has: `@saroh/ui`'s, the same ones `MoneyInput` shows and keeps.
 */
export { moneyDecimals, moneySign };
