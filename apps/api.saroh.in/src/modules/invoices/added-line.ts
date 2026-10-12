import { rateToBps, splitInclusive } from "./gst";
import { fromCents, toCents } from "./totals";

/*
 * How a paper prints a line sold under "GST is added to my prices" (the
 * owner's rule, 12 Oct 2026: "If the business says prices include GST,
 * ₹1,000 will be the full amount. If they say exclude, then ₹1,000 + GST").
 *
 * Such a line's stored `unitPrice` and `amount` are the amount to pay, GST
 * and all, as every line's are, and stay so: totals, pay links, refunds and
 * credit notes work from them. Only the paper reads differently. Its rate
 * is the price the business typed, before GST; its amount is the line's
 * taxable value; the GST and the total are what was frozen. So the paper
 * reads ₹1,000 + ₹180 GST = ₹1,180, and its lines add up to the taxable
 * value, the taxable value and the GST to the total.
 *
 * Everything here is read from what the line froze (`unitPrice`, `gstRate`,
 * `taxableValue`, `cgst`, `sgst`, `igst`, `discount`, `gstPriceMode`).
 * Nothing is read from today's settings, and no stored amount is rewritten.
 *
 * **The typed price is read back from the frozen unit amount, exactly.** A
 * unit sold under "added" pays the typed price plus its GST rounded to the
 * paisa (`unitPayCents` in `gst-price.ts`). The rounding moves the amount
 * by at most half a paisa, and dividing by (1 + rate) shrinks that below
 * half a paisa, so the taxable value of one unit's amount is the typed
 * price again, for every price and every rate above 0
 * (`added-line.spec.ts` checks each rate). An order line's own record of it
 * (`OrderItem.listPrice`) says the same.
 *
 * **The amount is the frozen taxable value, never quantity × rate.** GST is
 * rounded on one unit and the line's tax is then derived from the whole
 * line, so the two can differ: 7 × ₹99.99 at 18% is ₹699.93, and the line's
 * taxable value is ₹699.94 (7 × ₹117.99 = ₹825.93, less ₹125.99 GST). The
 * totals use the frozen ₹699.94, so the paper prints it, and says what one
 * unit comes to with GST (`unitPay`), which does multiply out: 7 × ₹117.99
 * is the ₹825.93 the line's taxable value and GST add up to.
 */

interface Money {
    toString(): string;
}

/** An invoice line, as far as its "GST is added" reading needs it. */
export interface LineForPaper {
    quantity: number;
    /** The amount to pay per unit, as frozen. */
    unitPrice: Money;
    /** The order discount's share, off the amount to pay. */
    discount?: Money | null;
    gstRate?: Money | null;
    taxableValue?: Money | null;
    cgst?: Money | null;
    sgst?: Money | null;
    igst?: Money | null;
    gstPriceMode?: string | null;
}

/** What the paper prints for a line GST was added to. All as money. */
export interface AddedLine {
    /** The price typed, per unit, before GST: "1000.00". */
    unitPrice: string;
    /** The line's taxable value, as frozen: "1000.00". */
    amount: string;
    /** The GST on the line, as frozen: "180.00". */
    gst: string;
    /**
     * The line's discount before GST: what stands between quantity × rate
     * and the amount. "0.00" when the line has none.
     */
    discount: string;
    /**
     * One unit with its GST ("117.99"), only where quantity × rate is not
     * the amount to the paisa and no discount explains it; else null.
     */
    unitPay: string | null;
}

const cents = (v: Money | null | undefined) =>
    v == null ? 0 : toCents(v.toString());

/**
 * The "GST is added" reading of a line, or null for every other line: one
 * recorded as "includes", one with no mode recorded (everything sold before
 * the choice existed), a receipt's, one with no rate, an exempt one. Those
 * print exactly as they always have.
 */
export function addedLine(line: LineForPaper): AddedLine | null {
    if (line.gstPriceMode !== "ADDED") return null;
    const rateBps = rateToBps(line.gstRate);
    if (!rateBps || rateBps <= 0 || line.taxableValue == null) return null;

    const unitPayCents = cents(line.unitPrice);
    const unitCents = splitInclusive(
        unitPayCents,
        rateBps,
        "INTER",
    ).taxableCents;
    const taxableCents = cents(line.taxableValue);
    const gstCents = cents(line.cgst) + cents(line.sgst) + cents(line.igst);
    const grossCents = line.quantity * unitCents;
    const discountCents =
        cents(line.discount) > 0 ? Math.max(0, grossCents - taxableCents) : 0;
    const multipliesOut = grossCents - discountCents === taxableCents;
    return {
        unitPrice: fromCents(unitCents),
        amount: fromCents(taxableCents),
        gst: fromCents(gstCents),
        discount: fromCents(discountCents),
        unitPay: multipliesOut ? null : fromCents(unitPayCents),
    };
}

/** How the prices on a paper carry GST, taken together. */
export type PaperPrices = "INCLUDED" | "ADDED" | "MIXED";

/**
 * Whether a paper's prices include GST, have it added, or both. Only a
 * line that carries GST (a rate above 0) has a say: a nil-rated line and
 * one with no rate say nothing about it either way. A paper with no line
 * GST was added to is INCLUDED, as every paper was before the choice.
 */
export function paperPrices(
    lines: readonly { rate: string | null; added: boolean }[],
): PaperPrices {
    const carrying = lines.filter((l) => {
        const bps = rateToBps(l.rate?.trim() ? l.rate : null);
        return bps !== null && Number.isFinite(bps) && bps > 0;
    });
    const added = carrying.filter((l) => l.added).length;
    if (added === 0) return "INCLUDED";
    return added === carrying.length ? "ADDED" : "MIXED";
}

/**
 * The sentence under a tax paper's total. "Prices include GST." when every
 * line includes it, its opposite when GST was added to every line, and
 * none on a mixed paper, where each line says its own.
 */
export function pricesSentence(prices: PaperPrices): string | null {
    if (prices === "INCLUDED") return "Prices include GST.";
    if (prices === "ADDED") return "GST is added to these prices.";
    return null;
}
