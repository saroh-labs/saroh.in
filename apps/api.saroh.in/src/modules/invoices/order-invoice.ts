import type { GstLine, GstLineInput, TaxType } from "./gst";
import {
    allocate,
    placeOfSupply,
    rateToBps,
    taxLines,
    taxTypeFor,
} from "./gst";
import { stateCode } from "./gst-states";
import { contactName } from "./serialize";
import { toCents } from "./totals";

/**
 * What an order's invoice, and the paper that corrects it, says (ADR-008) —
 * pure: the database reads and writes are in `order-invoicing.ts`.
 */

interface Money {
    toString(): string;
}

/** The business's GST standing, read once per document. */
export interface TaxProfile {
    registered: boolean;
    gstin: string | null;
    /** A GST state code, e.g. "29". */
    state: string | null;
    prefix: string | null;
    timezone: string | null;
    deliveryRateBps: number;
    deliverySac: string | null;
}

export interface OrderForInvoice {
    subtotal: Money;
    tax: Money;
    shipping: Money;
    discount: Money;
    total: Money;
    fulfilment: string;
    deliveryName: string | null;
    deliveryLine1: string | null;
    deliveryLine2: string | null;
    deliveryCity: string | null;
    deliveryState: string | null;
    deliveryPostalCode: string | null;
    customer: {
        firstName: string | null;
        lastName: string | null;
        email: string;
    };
    items: {
        id: string;
        quantity: number;
        price: Money;
        product: {
            name: string;
            gstRate: Money | null;
            hsnCode: string | null;
        };
        variant: { title: string } | null;
    }[];
}

/** A document ready to write: lines with their tax, and the header's sums. */
export interface BuiltDocument {
    lines: GstLine[];
    subtotalCents: number;
    taxCents: number;
    totalCents: number;
    cgstCents: number;
    sgstCents: number;
    igstCents: number;
    /** Null on a receipt. */
    placeOfSupply: string | null;
    taxType: TaxType | null;
    sellerGstin: string | null;
    sellerState: string | null;
}

export interface BillTo {
    name: string;
    email: string | null;
    address: string | null;
    state: string | null;
}

const DELIVERY = "Delivery";

/** The order's customer and, for a delivery, where it goes. */
export function orderBillTo(order: OrderForInvoice): BillTo {
    const delivered = order.fulfilment === "DELIVERY" && order.deliveryLine1;
    const address = delivered
        ? [
              order.deliveryName,
              order.deliveryLine1,
              order.deliveryLine2,
              [order.deliveryCity, order.deliveryPostalCode]
                  .filter(Boolean)
                  .join(" "),
              order.deliveryState,
          ]
              .filter((x) => x && x.trim() !== "")
              .join(", ")
        : null;
    return {
        name: contactName(order.customer),
        email: order.customer.email,
        address,
        state: null,
    };
}

/**
 * The invoice for an order: its lines at the price paid, the order's
 * discount spread across them before tax, delivery as a taxed line — so the
 * invoice totals what the order does.
 *
 * A registered business's order carries GST inside its prices (its
 * `Order.tax` is informational). An unregistered one issues a receipt, and
 * any tax the storefront added on top is the receipt's tax. Whatever the
 * lines cannot explain (an order placed before GST, with tax added on top)
 * is carried as its own untaxed line, so the paper never disagrees with
 * what was charged.
 */
export function buildOrderInvoice(
    order: OrderForInvoice,
    profile: TaxProfile,
): BuiltDocument {
    const inputs: GstLineInput[] = order.items.map((item) => ({
        description: item.variant
            ? `${item.product.name} — ${item.variant.title}`
            : item.product.name,
        quantity: item.quantity,
        unitCents: toCents(item.price.toString()),
        rateBps: rateToBps(item.product.gstRate),
        code: item.product.hsnCode,
        orderItemId: item.id,
    }));
    const shippingCents = toCents(order.shipping.toString());
    if (shippingCents > 0) {
        inputs.push({
            description: DELIVERY,
            quantity: 1,
            unitCents: shippingCents,
            rateBps: profile.deliveryRateBps,
            code: profile.deliverySac,
            discountable: false,
        });
    }

    const pos = profile.registered
        ? placeOfSupply({
              billToState: null,
              deliveryState:
                  order.fulfilment === "DELIVERY" ? order.deliveryState : null,
              businessState: profile.state,
          })
        : null;
    const taxType = profile.registered ? taxTypeFor(pos, profile.state) : null;

    const taxed = taxLines(inputs, {
        registered: profile.registered,
        taxType: taxType ?? "INTRA",
        discountCents: toCents(order.discount.toString()),
    });
    const orderTotal = toCents(order.total.toString());
    const gap = orderTotal - taxed.totals.totalCents;

    let lines = taxed.lines;
    let addOnTax = 0;
    if (gap > 0 && !profile.registered) {
        addOnTax = gap;
    } else if (gap > 0) {
        const extra = taxLines(
            [
                {
                    description: "Tax added at checkout",
                    quantity: 1,
                    unitCents: gap,
                    rateBps: null,
                    code: null,
                    discountable: false,
                },
            ],
            { registered: true, taxType: taxType ?? "INTRA" },
        );
        lines = [...lines, ...extra.lines];
    }

    return finish(lines, addOnTax, {
        placeOfSupply: pos,
        taxType,
        sellerGstin: profile.registered ? profile.gstin : null,
        sellerState: profile.registered ? profile.state : null,
    });
}

/** Header sums from the frozen lines: subtotal + tax = total, always. */
export function finish(
    lines: GstLine[],
    addOnTaxCents: number,
    gst: Pick<
        BuiltDocument,
        "placeOfSupply" | "taxType" | "sellerGstin" | "sellerState"
    >,
): BuiltDocument {
    const sum = (pick: (l: GstLine) => number) =>
        lines.reduce((s, l) => s + pick(l), 0);
    const amount = sum((l) => l.amountCents);
    const gstTax = sum((l) => l.taxCents);
    return {
        lines,
        subtotalCents: amount - gstTax,
        taxCents: gstTax + addOnTaxCents,
        totalCents: amount + addOnTaxCents,
        cgstCents: sum((l) => l.cgstCents),
        sgstCents: sum((l) => l.sgstCents),
        igstCents: sum((l) => l.igstCents),
        ...gst,
    };
}

/** A line of an issued invoice, as a correction reads it. */
export interface IssuedLine {
    description: string;
    quantity: number;
    unitPrice: Money;
    amount: Money;
    gstRate: Money | null;
    hsnSac: string | null;
    orderItemId: string | null;
}

/** What a correction is against: the original's GST standing and lines. */
export interface Original {
    sellerGstin: string | null;
    sellerState: string | null;
    placeOfSupply: string | null;
    taxType: string | null;
    tax: Money;
    total: Money;
    lines: IssuedLine[];
}

function gstOf(original: Original) {
    return {
        placeOfSupply: original.placeOfSupply,
        taxType: (original.taxType as TaxType | null) ?? null,
        sellerGstin: original.sellerGstin,
        sellerState: original.sellerState,
    };
}

/**
 * The lines of a credit note for `amountCents` of an issued invoice.
 *
 * Itemised when the refund names order lines that add up to the amount:
 * each credits its own invoice line at that line's rate. Otherwise (a refund
 * in full, one made in the provider's dashboard, part of a refund split
 * across two payments) the amount is spread over the invoice's lines in
 * proportion, so each rate carries its share of the tax. The original's
 * place of supply holds: a credit note is taxed as its invoice was.
 */
export function buildCreditNote(
    original: Original,
    amountCents: number,
    refundLines: {
        orderItemId: string;
        quantity: number;
        amountCents: number;
    }[] = [],
): BuiltDocument {
    const registered = original.sellerGstin !== null;
    const taxType = (original.taxType as TaxType | null) ?? "INTRA";
    const byItem = new Map<string, IssuedLine>();
    for (const l of original.lines) {
        if (l.orderItemId) byItem.set(l.orderItemId, l);
    }
    const matched = refundLines.flatMap((r) => {
        const line = byItem.get(r.orderItemId);
        return line ? [{ r, line }] : [];
    });
    const itemised =
        refundLines.length > 0 &&
        matched.length === refundLines.length &&
        refundLines.reduce((s, l) => s + l.amountCents, 0) === amountCents;

    const inputs: GstLineInput[] = itemised
        ? matched.map(({ r, line }) => {
              return {
                  description: line.description,
                  quantity: r.quantity,
                  unitCents: toCents(line.unitPrice.toString()),
                  rateBps: rateToBps(line.gstRate),
                  code: line.hsnSac,
                  orderItemId: r.orderItemId,
              };
          })
        : [];
    let discounts: number[] = [];
    if (itemised) {
        // What the line cost less what comes back: its share of the discount.
        discounts = refundLines.map((r, i) =>
            Math.max(
                0,
                inputs[i].quantity * inputs[i].unitCents - r.amountCents,
            ),
        );
    } else {
        const weights = original.lines.map((l) => toCents(l.amount.toString()));
        const shares = allocate(weights, amountCents);
        original.lines.forEach((l, i) => {
            if (shares[i] === 0) return;
            inputs.push({
                description: l.description,
                quantity: 1,
                unitCents: shares[i],
                rateBps: rateToBps(l.gstRate),
                code: l.hsnSac,
                orderItemId: l.orderItemId,
            });
        });
        discounts = inputs.map(() => 0);
    }

    const taxed = inputs.map(
        (input, i) =>
            taxLines([input], {
                registered,
                taxType,
                discountCents: discounts[i],
            }).lines[0],
    );
    // A receipt's add-on tax comes back in proportion too.
    let addOn = 0;
    const originalTotal = toCents(original.total.toString());
    const originalAddOn = registered ? 0 : toCents(original.tax.toString());
    if (originalAddOn > 0 && originalTotal > 0) {
        const lineTotal = taxed.reduce((s, l) => s + l.amountCents, 0);
        addOn = Math.min(originalAddOn, Math.max(0, amountCents - lineTotal));
    }
    return finish(taxed, addOn, gstOf(original));
}

/**
 * A supplementary invoice (or, down, a credit note) for an edit before
 * preparing: the quantities that changed, at the price and rate each line
 * was bought at. No discount moves — an edit keeps the order's discount.
 */
export function buildCorrection(
    original: Pick<
        Original,
        "sellerGstin" | "sellerState" | "placeOfSupply" | "taxType"
    >,
    changes: {
        description: string;
        quantity: number;
        unitCents: number;
        rateBps: number | null;
        code: string | null;
        orderItemId: string | null;
    }[],
): BuiltDocument {
    const registered = original.sellerGstin !== null;
    const taxed = taxLines(changes, {
        registered,
        taxType: (original.taxType as TaxType | null) ?? "INTRA",
    });
    return finish(taxed.lines, 0, {
        placeOfSupply: original.placeOfSupply,
        taxType: (original.taxType as TaxType | null) ?? null,
        sellerGstin: original.sellerGstin,
        sellerState: original.sellerState,
    });
}

/**
 * A hand-written invoice's tax: its lines at their rates, the place of
 * supply from the bill-to state. Registered only; a receipt keeps the tax
 * typed on it.
 */
export function buildManualInvoice(
    lines: {
        description: string;
        quantity: number;
        unitCents: number;
        rateBps: number | null;
        code: string | null;
    }[],
    profile: Pick<TaxProfile, "registered" | "gstin" | "state">,
    billToState: string | null,
    typedTaxCents: number,
): BuiltDocument {
    if (!profile.registered) {
        const taxed = taxLines(lines, { registered: false, taxType: "INTRA" });
        return finish(taxed.lines, typedTaxCents, {
            placeOfSupply: null,
            taxType: null,
            sellerGstin: null,
            sellerState: null,
        });
    }
    const pos = placeOfSupply({
        billToState,
        deliveryState: null,
        businessState: profile.state,
    });
    const taxType = taxTypeFor(pos, profile.state);
    const taxed = taxLines(lines, { registered: true, taxType });
    return finish(taxed.lines, 0, {
        placeOfSupply: pos,
        taxType,
        sellerGstin: profile.gstin,
        sellerState: profile.state,
    });
}

/** Normalises a typed state for the bill-to: a code, or null. */
export const billToStateCode = stateCode;

/**
 * The GST inside a registered business's order, for `Order.tax` — which on
 * such an order is informational: the prices already include it, so it is
 * never added to the total (ADR-008). Worked out exactly as the order's
 * invoice will be: discount spread first, delivery a taxed line.
 */
export function gstInsideOrder(
    lines: { quantity: number; unitCents: number; rateBps: number | null }[],
    opts: {
        shippingCents: number;
        discountCents: number;
        deliveryState: string | null;
        profile: Pick<TaxProfile, "state" | "deliveryRateBps">;
    },
): number {
    const inputs: GstLineInput[] = lines.map((l) => ({
        description: "",
        quantity: l.quantity,
        unitCents: l.unitCents,
        rateBps: l.rateBps,
        code: null,
    }));
    if (opts.shippingCents > 0) {
        inputs.push({
            description: DELIVERY,
            quantity: 1,
            unitCents: opts.shippingCents,
            rateBps: opts.profile.deliveryRateBps,
            code: null,
            discountable: false,
        });
    }
    const pos = placeOfSupply({
        deliveryState: opts.deliveryState,
        businessState: opts.profile.state,
    });
    return taxLines(inputs, {
        registered: true,
        taxType: taxTypeFor(pos, opts.profile.state),
        discountCents: opts.discountCents,
    }).totals.taxCents;
}
