import { bpsToRate, rateToBps } from "./gst";
import type { GstOnPrice } from "./gst-price";
import { gstInsidePaid, isGstPriceMode } from "./gst-price";
import { toCents } from "./totals";

/*
 * The customer's GST words for a line already charged (12 Oct 2026): an
 * invoice's line, read from what it froze, and an order's line, read from
 * what it was sold under. The site only formats the answer
 * (`gstPriceWords` in `@saroh/site-blocks`), so the pay page, the order's
 * pay link and the confirmation say the same thing the product page and
 * the bag said before the money moved.
 */

interface Money {
    toString(): string;
}

/** An issued invoice's line, as far as its GST words need it. */
export interface IssuedLineForWords {
    amount: Money;
    gstRate: Money | null;
    taxableValue?: Money | null;
    cgst?: Money | null;
    sgst?: Money | null;
    igst?: Money | null;
    gstPriceMode?: string | null;
}

/**
 * The words for an invoice line, from its frozen sums: never worked out
 * again. Null on a receipt (no taxable value), a line with no rate, and an
 * exempt one. A line from before the choice existed included GST.
 */
export function invoiceLineGst(line: IssuedLineForWords): GstOnPrice | null {
    const rateBps = rateToBps(line.gstRate);
    if (line.taxableValue == null || !rateBps) return null;
    const payCents = toCents(line.amount.toString());
    const cents = (v: Money | null | undefined) =>
        v == null ? 0 : toCents(v.toString());
    const gstCents = cents(line.cgst) + cents(line.sgst) + cents(line.igst);
    const added = line.gstPriceMode === "ADDED";
    return {
        mode: added ? "ADDED" : "INCLUDED",
        rate: bpsToRate(rateBps),
        listCents: added ? toCents(line.taxableValue.toString()) : payCents,
        gstCents,
        payCents,
    };
}

/** An order's line, as far as its GST words need it. */
export interface OrderLineForWords {
    quantity: number;
    /** The amount to pay per unit, as the line was sold. */
    price: Money;
    /** What it was sold under; null when no GST was charged, or before. */
    gstPriceMode?: string | null;
    product?: { gstRate: Money | null } | null;
    service?: { gstRate: Money | null } | null;
}

/**
 * The words for an order line: only a line sold under a mode (a registered
 * business, at a rate above 0, since the choice existed) says anything, at
 * its item's rate as the order's invoice will read it.
 */
export function orderLineGst(line: OrderLineForWords): GstOnPrice | null {
    if (!isGstPriceMode(line.gstPriceMode)) return null;
    const rate = line.product
        ? line.product.gstRate
        : (line.service?.gstRate ?? null);
    return gstInsidePaid({
        payCents: toCents(Number(line.price).toFixed(2)) * line.quantity,
        rateBps: rateToBps(rate),
        mode: line.gstPriceMode,
    });
}
