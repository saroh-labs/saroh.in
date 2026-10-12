import { bpsToRate, rateToBps } from "./gst";
import type { GstOnPrice } from "./gst-price";
import { gstInsidePaid, isGstPriceMode } from "./gst-price";
import { fromCents, toCents } from "./totals";

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
    /** The price typed, as the line recorded it beside the mode. */
    listPrice?: Money | null;
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

/** An order line's rate, amount and GST words, as a paper prints them. */
export interface OrderLineOnPaper {
    unitPrice: string;
    amount: string;
    /** One unit with its GST, only where the units do not multiply out. */
    unitPay: string | null;
    gst: GstOnPrice | null;
}

/**
 * How an order's line prints (12 Oct 2026, the owner's rule: a price GST
 * is added to reads "₹1,000 + GST"). A line sold under "GST is added"
 * prints the price typed (`OrderItem.listPrice`, as recorded when it was
 * sold) as its rate and the line before GST as its amount, with the GST in
 * its words, so the three add up to what is paid. Every other line prints
 * the amount to pay, as it always has.
 *
 * The amount before GST is the one its GST words are worked out from
 * (`gstInsidePaid` over the whole line), so amount + GST is the line's
 * amount to pay to the paisa. Where quantity × the typed price is not that
 * amount (GST is rounded on one unit: 7 × ₹99.99 at 18% is ₹699.93, the
 * line before GST ₹699.94), `unitPay` says what one unit comes to with
 * GST, which does multiply out.
 */
export function orderLineOnPaper(line: OrderLineForWords): OrderLineOnPaper {
    const unitPayCents = toCents(Number(line.price).toFixed(2));
    const gst = orderLineGst(line);
    if (gst?.mode !== "ADDED") {
        return {
            unitPrice: fromCents(unitPayCents),
            amount: fromCents(unitPayCents * line.quantity),
            unitPay: null,
            gst,
        };
    }
    // The typed price as recorded; a line that kept none reads it back
    // from the unit's amount, which gives the same paisa (`added-line.ts`).
    const listCents =
        line.listPrice != null
            ? toCents(Number(line.listPrice).toFixed(2))
            : (gstInsidePaid({
                  payCents: unitPayCents,
                  rateBps: rateToBps(gst.rate),
                  mode: "ADDED",
              })?.listCents ?? unitPayCents);
    return {
        unitPrice: fromCents(listCents),
        amount: fromCents(gst.listCents),
        unitPay:
            listCents * line.quantity === gst.listCents
                ? null
                : fromCents(unitPayCents),
        gst,
    };
}
