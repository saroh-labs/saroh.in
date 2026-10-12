import { NO_GST_TERMS, sellUnit, soldColumns } from "./gst-price";
import { invoiceLineGst, orderLineGst } from "./line-gst-words";
import type { IssuedLine, OrderForInvoice, TaxProfile } from "./order-invoice";
import {
    buildCorrection,
    buildCreditNote,
    buildManualInvoice,
    buildOrderInvoice,
} from "./order-invoice";
import { fromCents } from "./totals";

/**
 * The paper for a sale under each way a business carries GST (12 Oct 2026,
 * amending ADR-008), with the sums written out.
 *
 * An order line records the amount to pay (`price`) and what it was charged
 * under. The invoice derives its tax from that amount as it always has, so
 * the business changing its choice later never changes a paper, and a
 * credit note reverses exactly what was charged.
 */

const dec = (v: string) => ({ toString: () => v });

const profile = (over: Partial<TaxProfile> = {}): TaxProfile => ({
    registered: true,
    gstin: "29AAGCR4375J1ZU",
    state: "29",
    prefix: "RC",
    timezone: "Asia/Kolkata",
    deliveryRateBps: 1800,
    deliverySac: "996813",
    priceMode: "INCLUDED",
    address: "14 Hill Road, Bengaluru 560038, Karnataka",
    seller: {
        sellerName: "Rye & Co.",
        sellerLegalName: null,
        sellerEmail: null,
    },
    ...over,
});

/** An order of one product line, sold under `terms` at ₹1,000 typed, 18%. */
function orderOf(
    terms: { registered: boolean; mode: "INCLUDED" | "ADDED" },
    quantity = 1,
    over: Partial<OrderForInvoice> = {},
): OrderForInvoice {
    const unit = sellUnit(100_000, { gstRate: "18" }, terms);
    const sold = soldColumns(unit);
    const total = fromCents(unit.payCents * quantity);
    return {
        subtotal: dec(total),
        tax: dec("0"),
        shipping: dec("0"),
        discount: dec("0"),
        total: dec(total),
        fulfilment: "PICKUP",
        deliveryName: null,
        deliveryLine1: null,
        deliveryLine2: null,
        deliveryCity: null,
        deliveryState: null,
        deliveryPostalCode: null,
        customer: { firstName: "Meera", lastName: "Iyer", email: "m@x.in" },
        items: [
            {
                id: "item_1",
                quantity,
                price: dec(fromCents(unit.payCents)),
                gstPriceMode: sold.gstPriceMode,
                product: {
                    name: "Face serum",
                    gstRate: dec("18"),
                    hsnCode: "3304",
                },
                variant: null,
            },
        ],
        ...over,
    };
}

/** The lines of a built document as an issued invoice stores them. */
function issued(doc: ReturnType<typeof buildOrderInvoice>): IssuedLine[] {
    return doc.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: dec(fromCents(l.unitCents)),
        amount: dec(fromCents(l.amountCents)),
        gstRate: l.rateBps === null ? null : dec(String(l.rateBps / 100)),
        hsnSac: l.code,
        orderItemId: l.orderItemId ?? null,
        gstPriceMode: l.priceMode ?? null,
    }));
}

function originalOf(doc: ReturnType<typeof buildOrderInvoice>) {
    return {
        sellerGstin: doc.sellerGstin,
        sellerState: doc.sellerState,
        sellerAddress: doc.sellerAddress,
        sellerName: doc.sellerName,
        sellerLegalName: doc.sellerLegalName,
        sellerEmail: doc.sellerEmail,
        placeOfSupply: doc.placeOfSupply,
        taxType: doc.taxType,
        tax: dec(fromCents(doc.taxCents)),
        total: dec(fromCents(doc.totalCents)),
        lines: issued(doc),
    };
}

const INCLUDES = { registered: true, mode: "INCLUDED" as const };
const ADDS = { registered: true, mode: "ADDED" as const };

describe("an existing business: prices include GST", () => {
    it("₹1,000 is ₹1,000 on the order and ₹847.46 + ₹152.54 on the invoice, as before", () => {
        const order = orderOf(INCLUDES);
        expect(order.total.toString()).toBe("1000.00");
        const doc = buildOrderInvoice(order, profile());
        expect(doc.totalCents).toBe(100_000);
        expect(doc.subtotalCents).toBe(84_746);
        expect(doc.taxCents).toBe(15_254);
        expect(doc.cgstCents).toBe(7_627);
        expect(doc.sgstCents).toBe(7_627);
        expect(doc.lines[0]).toMatchObject({
            unitCents: 100_000,
            amountCents: 100_000,
            taxableCents: 84_746,
            priceMode: "INCLUDED",
        });
    });

    it("a line from before the choice existed (no mode) builds the same paper", () => {
        const order = orderOf(INCLUDES);
        const old = {
            ...order,
            items: order.items.map((i) => ({ ...i, gstPriceMode: null })),
        };
        const a = buildOrderInvoice(order, profile());
        const b = buildOrderInvoice(old, profile());
        expect(b.totalCents).toBe(a.totalCents);
        expect(b.taxCents).toBe(a.taxCents);
        expect(b.subtotalCents).toBe(a.subtotalCents);
        expect(b.lines[0]?.priceMode).toBeNull();
    });
});

describe("GST is added", () => {
    it("₹1,000 is ₹1,180 on the order: ₹1,000 taxable, ₹90 CGST, ₹90 SGST", () => {
        const order = orderOf(ADDS);
        expect(order.total.toString()).toBe("1180.00");
        expect(order.items[0]?.gstPriceMode).toBe("ADDED");
        const doc = buildOrderInvoice(order, profile({ priceMode: "ADDED" }));
        expect(doc.totalCents).toBe(118_000);
        expect(doc.subtotalCents).toBe(100_000);
        expect(doc.taxCents).toBe(18_000);
        expect(doc.cgstCents).toBe(9_000);
        expect(doc.sgstCents).toBe(9_000);
        expect(doc.lines[0]).toMatchObject({
            unitCents: 118_000,
            amountCents: 118_000,
            taxableCents: 100_000,
            priceMode: "ADDED",
        });
    });

    it("3 of them are ₹3,540: ₹3,000 taxable and ₹540 GST", () => {
        const doc = buildOrderInvoice(
            orderOf(ADDS, 3),
            profile({ priceMode: "ADDED" }),
        );
        expect(doc.totalCents).toBe(354_000);
        expect(doc.subtotalCents).toBe(300_000);
        expect(doc.taxCents).toBe(54_000);
    });

    it("delivered to another state, the ₹180 is IGST", () => {
        const doc = buildOrderInvoice(
            orderOf(ADDS, 1, {
                fulfilment: "SHIPPING",
                deliveryLine1: "1 Beach Road",
                deliveryState: "Goa",
            }),
            profile({ priceMode: "ADDED" }),
        );
        expect(doc.taxType).toBe("INTER");
        expect(doc.igstCents).toBe(18_000);
        expect(doc.totalCents).toBe(118_000);
    });

    it("the delivery charge is charged as typed, GST inside it", () => {
        // ₹1,180 of goods and a ₹59 delivery: ₹50 + ₹9 GST inside the ₹59.
        const order = orderOf(ADDS, 1, {
            shipping: dec("59.00"),
            total: dec("1239.00"),
        });
        const doc = buildOrderInvoice(order, profile({ priceMode: "ADDED" }));
        expect(doc.totalCents).toBe(123_900);
        expect(doc.lines[1]).toMatchObject({
            description: "Delivery",
            amountCents: 5_900,
            taxableCents: 5_000,
            taxCents: 900,
        });
        expect(doc.taxCents).toBe(18_900);
    });

    it("a discount comes off the amount to pay, spread before tax", () => {
        // ₹1,180 less ₹118 is ₹1,062: ₹900 taxable, ₹162 GST.
        const order = orderOf(ADDS, 1, {
            discount: dec("118.00"),
            total: dec("1062.00"),
        });
        const doc = buildOrderInvoice(order, profile({ priceMode: "ADDED" }));
        expect(doc.totalCents).toBe(106_200);
        expect(doc.subtotalCents).toBe(90_000);
        expect(doc.taxCents).toBe(16_200);
    });
});

describe("after the business changes its mind", () => {
    it("the order sold under 'added' is invoiced the same under today's 'included' profile", () => {
        // Pay-later: sold while GST was added, invoiced after the flip.
        const order = orderOf(ADDS);
        const then = buildOrderInvoice(order, profile({ priceMode: "ADDED" }));
        const now = buildOrderInvoice(
            order,
            profile({ priceMode: "INCLUDED" }),
        );
        expect(now.totalCents).toBe(then.totalCents);
        expect(now.taxCents).toBe(then.taxCents);
        expect(now.lines[0]?.priceMode).toBe("ADDED");
    });

    it("a full credit note reverses exactly ₹1,000 + ₹180", () => {
        const doc = buildOrderInvoice(
            orderOf(ADDS),
            profile({ priceMode: "ADDED" }),
        );
        // No profile is read: a credit note is built from its original.
        const note = buildCreditNote(originalOf(doc), 118_000);
        expect(note.totalCents).toBe(118_000);
        expect(note.subtotalCents).toBe(100_000);
        expect(note.taxCents).toBe(18_000);
        expect(note.cgstCents).toBe(9_000);
        expect(note.sgstCents).toBe(9_000);
        expect(note.lines[0]?.priceMode).toBe("ADDED");
    });

    it("a refund of one of three units credits ₹1,000 + ₹180, by line", () => {
        const doc = buildOrderInvoice(
            orderOf(ADDS, 3),
            profile({ priceMode: "ADDED" }),
        );
        const note = buildCreditNote(originalOf(doc), 118_000, [
            { orderItemId: "item_1", quantity: 1, amountCents: 118_000 },
        ]);
        expect(note.lines).toHaveLength(1);
        expect(note.lines[0]).toMatchObject({
            quantity: 1,
            unitCents: 118_000,
            amountCents: 118_000,
            taxableCents: 100_000,
            taxCents: 18_000,
            priceMode: "ADDED",
        });
    });

    it("a part refund of ₹590 credits ₹500 + ₹90", () => {
        const doc = buildOrderInvoice(
            orderOf(ADDS),
            profile({ priceMode: "ADDED" }),
        );
        const note = buildCreditNote(originalOf(doc), 59_000);
        expect(note.totalCents).toBe(59_000);
        expect(note.subtotalCents).toBe(50_000);
        expect(note.taxCents).toBe(9_000);
    });

    it("an 'included' order's credit note is what it always was", () => {
        const doc = buildOrderInvoice(orderOf(INCLUDES), profile());
        const note = buildCreditNote(originalOf(doc), 100_000);
        expect(note.totalCents).toBe(100_000);
        expect(note.subtotalCents).toBe(84_746);
        expect(note.taxCents).toBe(15_254);
        expect(note.lines[0]?.priceMode).toBe("INCLUDED");
    });

    it("an edit's correction bills added units at the price the line was sold at", () => {
        const doc = buildOrderInvoice(
            orderOf(ADDS),
            profile({ priceMode: "ADDED" }),
        );
        const more = buildCorrection(originalOf(doc), [
            {
                description: "Face serum",
                quantity: 2,
                unitCents: 118_000,
                rateBps: 1800,
                code: "3304",
                orderItemId: "item_1",
                priceMode: "ADDED",
            },
        ]);
        expect(more.totalCents).toBe(236_000);
        expect(more.subtotalCents).toBe(200_000);
        expect(more.taxCents).toBe(36_000);
        expect(more.lines[0]?.priceMode).toBe("ADDED");
    });
});

describe("a booking's paper", () => {
    it("a ₹295 deposit of ₹1,000 + 18% is ₹250 taxable and ₹45 GST", () => {
        const doc = buildManualInvoice(
            [
                {
                    description: "Deposit for Facial",
                    quantity: 1,
                    unitCents: 29_500,
                    rateBps: 1800,
                    code: "999721",
                    priceMode: "ADDED",
                },
            ],
            profile({ priceMode: "ADDED" }),
            null,
            0,
        );
        expect(doc.totalCents).toBe(29_500);
        expect(doc.subtotalCents).toBe(25_000);
        expect(doc.taxCents).toBe(4_500);
        expect(doc.lines[0]?.priceMode).toBe("ADDED");
    });

    it("the balance, ₹885, is ₹750 taxable and ₹135 GST: the two add to ₹1,180", () => {
        const doc = buildManualInvoice(
            [
                {
                    description: "Balance for Facial",
                    quantity: 1,
                    unitCents: 88_500,
                    rateBps: 1800,
                    code: "999721",
                    priceMode: "ADDED",
                },
            ],
            profile({ priceMode: "ADDED" }),
            null,
            0,
        );
        expect(doc.subtotalCents).toBe(75_000);
        expect(doc.taxCents).toBe(13_500);
        expect(29_500 + doc.totalCents).toBe(118_000);
    });
});

describe("a business that is not registered", () => {
    it("charges the typed price and issues a receipt with no mode on it", () => {
        const order = orderOf({ registered: false, mode: "ADDED" });
        expect(order.total.toString()).toBe("1000.00");
        expect(order.items[0]?.gstPriceMode).toBeNull();
        const doc = buildOrderInvoice(
            order,
            profile({ registered: false, gstin: null, priceMode: "ADDED" }),
        );
        expect(doc.totalCents).toBe(100_000);
        expect(doc.taxCents).toBe(0);
        expect(doc.sellerGstin).toBeNull();
        expect(sellUnit(100_000, { gstRate: "18" }, NO_GST_TERMS).mode).toBe(
            null,
        );
    });
});

describe("the customer's words for a line already charged", () => {
    it("an order line sold with GST added: ₹2,000 + ₹360 GST (18%)", () => {
        expect(
            orderLineGst({
                quantity: 2,
                price: dec("1180.00"),
                gstPriceMode: "ADDED",
                product: { gstRate: dec("18") },
            }),
        ).toEqual({
            mode: "ADDED",
            rate: "18",
            listCents: 200_000,
            gstCents: 36_000,
            payCents: 236_000,
        });
    });

    it("an order line sold with GST included: ₹1,000, includes ₹152.54", () => {
        expect(
            orderLineGst({
                quantity: 1,
                price: dec("1000"),
                gstPriceMode: "INCLUDED",
                service: { gstRate: dec("18") },
            }),
        ).toEqual({
            mode: "INCLUDED",
            rate: "18",
            listCents: 100_000,
            gstCents: 15_254,
            payCents: 100_000,
        });
    });

    it("says nothing for a line sold with no GST, or before the choice existed", () => {
        expect(
            orderLineGst({
                quantity: 1,
                price: dec("1000"),
                gstPriceMode: null,
                product: { gstRate: dec("18") },
            }),
        ).toBeNull();
        expect(
            orderLineGst({
                quantity: 1,
                price: dec("1000"),
                gstPriceMode: "ADDED",
                product: { gstRate: null },
            }),
        ).toBeNull();
    });

    it("an invoice line reads its frozen sums, never working them out again", () => {
        expect(
            invoiceLineGst({
                amount: dec("295.00"),
                gstRate: dec("18.00"),
                taxableValue: dec("250.00"),
                cgst: dec("22.50"),
                sgst: dec("22.50"),
                igst: dec("0"),
                gstPriceMode: "ADDED",
            }),
        ).toEqual({
            mode: "ADDED",
            rate: "18",
            listCents: 25_000,
            gstCents: 4_500,
            payCents: 29_500,
        });
    });

    it("an invoice line from before the choice existed included GST", () => {
        expect(
            invoiceLineGst({
                amount: dec("1000.00"),
                gstRate: dec("18"),
                taxableValue: dec("847.46"),
                cgst: dec("0"),
                sgst: dec("0"),
                igst: dec("152.54"),
                gstPriceMode: null,
            }),
        ).toEqual({
            mode: "INCLUDED",
            rate: "18",
            listCents: 100_000,
            gstCents: 15_254,
            payCents: 100_000,
        });
    });

    it("says nothing for a receipt's line, a line with no rate, or an exempt one", () => {
        const base = {
            amount: dec("1000.00"),
            cgst: dec("0"),
            sgst: dec("0"),
            igst: dec("0"),
        };
        expect(
            invoiceLineGst({ ...base, gstRate: null, taxableValue: null }),
        ).toBeNull();
        expect(
            invoiceLineGst({
                ...base,
                gstRate: dec("18"),
                taxableValue: null,
            }),
        ).toBeNull();
        expect(
            invoiceLineGst({
                ...base,
                gstRate: dec("0"),
                taxableValue: dec("1000.00"),
            }),
        ).toBeNull();
    });
});
