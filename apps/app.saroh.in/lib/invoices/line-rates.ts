import type { InvoiceInput, InvoiceLine } from "./service";

/**
 * A hand-written invoice's lines and their GST rates (12 Oct 2026). Pure.
 *
 * A GST-registered business's invoice is a tax invoice, so each line needs
 * the rate its price includes before it is issued: 0% for an exempt or
 * nil-rated line, never nothing. A draft may still be saved without them.
 * The API refuses the issue too (`GST_RATE_MISSING`, the lines named by
 * their place), and the screen that pressed Issue asks in place.
 */

/** What a line with no rate is told when Issue is pressed. */
export const LINE_RATE_NEEDED =
    "Choose this line's GST rate. Pick 0% if it's exempt or nil-rated.";

/**
 * The places, from 0, of the lines Issue waits on: a registered business's
 * lines with no rate. None for a business that isn't registered.
 */
export function linesMissingRate(
    lines: readonly { gstRate: string }[],
    registered: boolean,
): number[] {
    if (!registered) return [];
    return lines.flatMap((line, place) => (line.gstRate === "" ? [place] : []));
}

/**
 * A draft's lines as an update sends them, with the rates chosen for the
 * lines at these places filled in. Every other line goes back as it was:
 * an update replaces the lines as a whole.
 */
export function linesWithRates(
    lines: readonly InvoiceLine[],
    rates: Readonly<Partial<Record<number, string>>>,
): NonNullable<InvoiceInput["lines"]> {
    return lines.map((line, place) => {
        const rate = rates[place] ?? line.gst?.rate ?? null;
        const code = line.gst?.hsnSac ?? null;
        return {
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            ...(rate !== null && rate !== "" ? { gstRate: rate } : {}),
            ...(code ? { hsnSac: code } : {}),
        };
    });
}
