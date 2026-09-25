/**
 * The first number of the series a business's invoices run in, as the API
 * numbers them (`numbering.ts`, ADR-008) — for the settings preview:
 *
 *  - GST-registered with a prefix: RC/26-27/0001, the year restarting each
 *    April;
 *  - not registered, with a prefix: RC-0001;
 *  - no prefix: the legacy INV series, INV/26-27/0001 once registered.
 */
export function sampleInvoiceNumber(
    prefix: string,
    registered: boolean,
    now: Date = new Date(),
): string {
    const p = prefix.trim().toUpperCase() || "INV";
    return registered ? `${p}/${financialYear(now)}/0001` : `${p}-0001`;
}

/**
 * India's financial year, April to March, in India's time: "26-27" runs from
 * 1 April 2026 to 31 March 2027.
 */
export function financialYear(now: Date): string {
    // IST is UTC+5:30 all year, so the date there is a fixed offset away.
    const ist = new Date(now.getTime() + 330 * 60_000);
    const year = ist.getUTCFullYear();
    const start = ist.getUTCMonth() >= 3 ? year : year - 1;
    const two = (y: number) => String(y % 100).padStart(2, "0");
    return `${two(start)}-${two(start + 1)}`;
}
