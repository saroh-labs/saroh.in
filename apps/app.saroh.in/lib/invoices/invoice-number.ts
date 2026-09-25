/**
 * The first number of the series a business's invoices run in, as the API
 * numbers them (`numbering.ts`, ADR-008) — for the settings preview:
 *
 *  - GST-registered with a prefix: RC/26-27/0001, the year restarting on
 *    the 1st of the month the business's financial year starts (April
 *    unless it chose another);
 *  - not registered, with a prefix: RC-0001;
 *  - no prefix: the legacy INV series, INV/26-27/0001 once registered.
 */
export function sampleInvoiceNumber(
    prefix: string,
    registered: boolean,
    fyStartMonth: number = FY_DEFAULT_START,
    now: Date = new Date(),
): string {
    const p = prefix.trim().toUpperCase() || "INV";
    return registered
        ? `${p}/${financialYear(now, fyStartMonth)}/0001`
        : `${p}-0001`;
}

/** India's financial year starts in April; so does every business's unless it chose. */
export const FY_DEFAULT_START = 4;

export const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
] as const;

/** A stored month, or April when it is missing or not one. */
function startMonth(month: number | undefined): number {
    return month !== undefined &&
        Number.isInteger(month) &&
        month >= 1 &&
        month <= 12
        ? month
        : FY_DEFAULT_START;
}

/**
 * The financial year a moment falls in, in India's time, as the number
 * carries it: from April, "26-27" runs 1 April 2026 to 31 March 2027; a
 * year from January spans one calendar year and carries it whole, "2026".
 */
export function financialYear(
    now: Date,
    fyStartMonth: number = FY_DEFAULT_START,
): string {
    const month = startMonth(fyStartMonth);
    // IST is UTC+5:30 all year, so the date there is a fixed offset away.
    const ist = new Date(now.getTime() + 330 * 60_000);
    const year = ist.getUTCFullYear();
    const start = ist.getUTCMonth() + 1 >= month ? year : year - 1;
    if (month === 1) return String(start);
    const two = (y: number) => String(y % 100).padStart(2, "0");
    return `${two(start)}-${two(start + 1)}`;
}

/** The months a financial year runs: 4 → "April – March". */
export function financialYearSpan(fyStartMonth: number | undefined): string {
    const month = startMonth(fyStartMonth);
    return `${MONTHS[month - 1]} – ${MONTHS[(month + 10) % 12]}`;
}
