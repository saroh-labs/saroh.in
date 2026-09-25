import type { OrderForInvoice, TaxProfile } from "./order-invoice";
import {
    buildCorrection,
    buildCreditNote,
    buildManualInvoice,
    buildOrderInvoice,
    formatSellerAddress,
    orderBillTo,
} from "./order-invoice";

const RYE: TaxProfile = {
    registered: true,
    gstin: "29AAGCR4375J1ZU",
    state: "29",
    prefix: "RC",
    timezone: "Asia/Kolkata",
    deliveryRateBps: 1800,
    deliverySac: "996813",
    address: "14 Hill Road, Indiranagar, Bengaluru 560038, Karnataka",
};

const UNREGISTERED: TaxProfile = {
    ...RYE,
    registered: false,
    gstin: null,
    state: null,
};

function order(over: Partial<OrderForInvoice> = {}): OrderForInvoice {
    return {
        subtotal: "478.00",
        tax: "0.00",
        shipping: "59.00",
        discount: "47.80",
        total: "489.20",
        fulfilment: "DELIVERY",
        deliveryName: "Meera Iyer",
        deliveryLine1: "12 Church Street",
        deliveryLine2: null,
        deliveryCity: "Bengaluru",
        deliveryState: "Karnataka",
        deliveryPostalCode: "560001",
        customer: { firstName: "Meera", lastName: "Iyer", email: "m@x.in" },
        items: [
            {
                id: "item_bread",
                quantity: 2,
                price: "180.00",
                product: {
                    name: "Country sourdough",
                    gstRate: "0",
                    hsnCode: "19059010",
                },
                variant: null,
            },
            {
                id: "item_pastry",
                quantity: 1,
                price: "118.00",
                product: {
                    name: "Almond croissant",
                    gstRate: "18.00",
                    hsnCode: "19059020",
                },
                variant: null,
            },
        ],
        ...over,
    };
}

describe("an order's invoice", () => {
    it("a discounted order with delivery totals exactly what the order does", () => {
        const doc = buildOrderInvoice(order(), RYE);
        expect(doc.totalCents).toBe(48920);
        expect(doc.subtotalCents + doc.taxCents).toBe(doc.totalCents);
        expect(doc.taxType).toBe("INTRA");
        expect(doc.placeOfSupply).toBe("29");
        expect(doc.sellerGstin).toBe("29AAGCR4375J1ZU");
        const [bread, pastry, delivery] = doc.lines;
        expect(bread.taxCents).toBe(0);
        expect(bread.discountCents).toBe(3600);
        // ₹106.20 after its share of the discount → ₹90 + ₹8.10 + ₹8.10.
        expect(pastry.amountCents).toBe(10620);
        expect(pastry.taxableCents).toBe(9000);
        expect(pastry.cgstCents).toBe(810);
        expect(delivery.description).toBe("Delivery");
        expect(delivery.code).toBe("996813");
        expect(delivery.cgstCents + delivery.sgstCents).toBe(900);
        expect(doc.cgstCents).toBe(810 + 450);
    });

    it("delivered to another state, it is IGST", () => {
        const doc = buildOrderInvoice(order({ deliveryState: "Goa" }), RYE);
        expect(doc.placeOfSupply).toBe("30");
        expect(doc.taxType).toBe("INTER");
        expect(doc.cgstCents).toBe(0);
        expect(doc.igstCents).toBe(1620 + 900);
    });

    it("a collected order is supplied where the business is", () => {
        const doc = buildOrderInvoice(
            order({
                fulfilment: "COLLECT",
                deliveryState: "Goa",
                shipping: "0",
                total: "430.20",
            }),
            RYE,
        );
        expect(doc.placeOfSupply).toBe("29");
        expect(doc.totalCents).toBe(43020);
    });

    it("an unregistered business issues a receipt; tax added at checkout is its tax", () => {
        const doc = buildOrderInvoice(
            order({ tax: "20.00", total: "509.20" }),
            UNREGISTERED,
        );
        expect(doc.sellerGstin).toBeNull();
        expect(doc.taxType).toBeNull();
        expect(doc.lines.every((l) => l.taxableCents === null)).toBe(true);
        expect(doc.taxCents).toBe(2000);
        expect(doc.totalCents).toBe(50920);
    });

    it("a registered order placed with tax on top keeps its total", () => {
        const doc = buildOrderInvoice(
            order({ tax: "20.00", total: "509.20" }),
            RYE,
        );
        expect(doc.totalCents).toBe(50920);
        expect(doc.lines[doc.lines.length - 1].description).toBe(
            "Tax added at checkout",
        );
    });

    it("bills the customer, and the delivery address when it is delivered", () => {
        expect(orderBillTo(order())).toEqual({
            name: "Meera Iyer",
            email: "m@x.in",
            address:
                "Meera Iyer, 12 Church Street, Bengaluru 560001, Karnataka",
            state: null,
        });
        expect(
            orderBillTo(order({ fulfilment: "COLLECT" })).address,
        ).toBeNull();
    });
});

describe("a credit note", () => {
    const original = () => {
        const doc = buildOrderInvoice(order(), RYE);
        return {
            sellerGstin: doc.sellerGstin,
            sellerState: doc.sellerState,
            sellerAddress: doc.sellerAddress,
            placeOfSupply: doc.placeOfSupply,
            taxType: doc.taxType,
            tax: String(doc.taxCents / 100),
            total: (doc.totalCents / 100).toFixed(2),
            lines: doc.lines.map((l) => ({
                description: l.description,
                quantity: l.quantity,
                unitPrice: (l.unitCents / 100).toFixed(2),
                amount: (l.amountCents / 100).toFixed(2),
                gstRate: l.rateBps === null ? null : String(l.rateBps / 100),
                hsnSac: l.code,
                orderItemId: l.orderItemId ?? null,
            })),
        };
    };

    it("for refunded lines credits those lines at their own rate", () => {
        const cn = buildCreditNote(original(), 10620, [
            { orderItemId: "item_pastry", quantity: 1, amountCents: 10620 },
        ]);
        expect(cn.totalCents).toBe(10620);
        expect(cn.lines).toHaveLength(1);
        expect(cn.lines[0].description).toBe("Almond croissant");
        expect(cn.lines[0].taxableCents).toBe(9000);
        expect(cn.lines[0].cgstCents).toBe(810);
        expect(cn.lines[0].discountCents).toBe(1180);
    });

    it("for an amount alone spreads it over the lines in proportion", () => {
        const cn = buildCreditNote(original(), 48920);
        expect(cn.totalCents).toBe(48920);
        expect(cn.cgstCents).toBe(810 + 450);
        expect(cn.taxType).toBe("INTRA");
    });

    /** The original's lines, then a supplementary invoice's for an edit. */
    const edited = (
        change: Parameters<typeof buildCorrection>[1][number],
    ): ReturnType<typeof original> => {
        const base = original();
        const supplementary = buildCorrection(
            {
                sellerGstin: base.sellerGstin,
                sellerState: base.sellerState,
                sellerAddress: base.sellerAddress,
                placeOfSupply: base.placeOfSupply,
                taxType: base.taxType,
            },
            [change],
        );
        return {
            ...base,
            lines: [
                ...base.lines,
                ...supplementary.lines.map((l) => ({
                    description: l.description,
                    quantity: l.quantity,
                    unitPrice: (l.unitCents / 100).toFixed(2),
                    amount: (l.amountCents / 100).toFixed(2),
                    gstRate:
                        l.rateBps === null ? null : String(l.rateBps / 100),
                    hsnSac: l.code,
                    orderItemId: l.orderItemId ?? null,
                })),
            ],
        };
    };

    it("for a line an edit added credits it at that line's own rate and HSN", () => {
        const withChai = edited({
            description: "Masala chai",
            quantity: 1,
            unitCents: 10000,
            rateBps: 500,
            code: "09023020",
            orderItemId: "item_chai",
        });
        const cn = buildCreditNote(withChai, 10000, [
            { orderItemId: "item_chai", quantity: 1, amountCents: 10000 },
        ]);
        expect(cn.totalCents).toBe(10000);
        expect(cn.lines).toHaveLength(1);
        expect(cn.lines[0]).toMatchObject({
            description: "Masala chai",
            rateBps: 500,
            code: "09023020",
            orderItemId: "item_chai",
        });
        // 5% inside ₹100: ₹95.24 taxable, ₹4.76 tax.
        expect(cn.lines[0].taxableCents).toBe(9524);
        expect(cn.taxCents).toBe(476);
    });

    it("for a line whose units an edit raised, spans both invoiced lines of the item", () => {
        const twoMore = edited({
            description: "Almond croissant",
            quantity: 2,
            unitCents: 11800,
            rateBps: 1800,
            code: "19059020",
            orderItemId: "item_pastry",
        });
        const cn = buildCreditNote(twoMore, 34200, [
            { orderItemId: "item_pastry", quantity: 3, amountCents: 34200 },
        ]);
        expect(cn.totalCents).toBe(34200);
        expect(cn.lines.map((l) => [l.quantity, l.amountCents])).toEqual([
            [1, 11400],
            [2, 22800],
        ]);
        expect(cn.lines.every((l) => l.rateBps === 1800)).toBe(true);
        expect(cn.lines.every((l) => l.code === "19059020")).toBe(true);

        // One unit back: it rides on one of the two lines, whole.
        const one = buildCreditNote(twoMore, 11800, [
            { orderItemId: "item_pastry", quantity: 1, amountCents: 11800 },
        ]);
        expect(one.lines).toHaveLength(1);
        expect(one.lines[0].quantity).toBe(1);
        expect(one.totalCents).toBe(11800);
    });

    it("for an amount alone reaches the lines an edit added", () => {
        const withChai = edited({
            description: "Masala chai",
            quantity: 1,
            unitCents: 10000,
            rateBps: 500,
            code: "09023020",
            orderItemId: "item_chai",
        });
        const cn = buildCreditNote(withChai, 48920 + 10000);
        expect(cn.totalCents).toBe(58920);
        expect(cn.lines.map((l) => l.description)).toContain("Masala chai");
    });
});

describe("an edit's correction", () => {
    it("a quantity up is a supplementary invoice for the added units", () => {
        const doc = buildCorrection(
            {
                sellerGstin: RYE.gstin,
                sellerState: "29",
                sellerAddress: RYE.address,
                placeOfSupply: "29",
                taxType: "INTRA",
            },
            [
                {
                    description: "Almond croissant",
                    quantity: 2,
                    unitCents: 11800,
                    rateBps: 1800,
                    code: "19059020",
                    orderItemId: "item_pastry",
                },
            ],
        );
        expect(doc.totalCents).toBe(23600);
        expect(doc.taxCents).toBe(3600);
    });
});

describe("a hand-written invoice", () => {
    it("a Karnataka business billing a Goa café charges IGST", () => {
        const doc = buildManualInvoice(
            [
                {
                    description: "Sourdough loaves (trade)",
                    quantity: 20,
                    unitCents: 15000,
                    rateBps: 0,
                    code: "19059010",
                },
                {
                    description: "Croissants (trade)",
                    quantity: 40,
                    unitCents: 5900,
                    rateBps: 1800,
                    code: "19059020",
                },
            ],
            RYE,
            "30",
            0,
        );
        expect(doc.taxType).toBe("INTER");
        expect(doc.placeOfSupply).toBe("30");
        expect(doc.igstCents).toBe(36000);
        expect(doc.cgstCents + doc.sgstCents).toBe(0);
        expect(doc.totalCents).toBe(300000 + 236000);
    });

    it("an unregistered business's receipt keeps the tax typed on it", () => {
        const doc = buildManualInvoice(
            [
                {
                    description: "Personal training",
                    quantity: 4,
                    unitCents: 150000,
                    rateBps: null,
                    code: null,
                },
            ],
            UNREGISTERED,
            null,
            10800,
        );
        expect(doc.sellerGstin).toBeNull();
        expect(doc.taxCents).toBe(10800);
        expect(doc.totalCents).toBe(610800);
    });
});

describe("the seller's registered address (CGST rule 46)", () => {
    it("prints as one line, its state named", () => {
        expect(
            formatSellerAddress({
                addressLine1: "14 Hill Road",
                addressLine2: " ",
                city: "Bengaluru",
                postalCode: "560038",
                stateName: "Karnataka",
            }),
        ).toBe("14 Hill Road, Bengaluru 560038, Karnataka");
        expect(
            formatSellerAddress({
                addressLine1: null,
                addressLine2: null,
                city: "Bengaluru",
                postalCode: null,
                stateName: null,
            }),
        ).toBeNull();
    });

    it("is frozen on a tax invoice, a receipt, and the paper that corrects them", () => {
        const doc = buildOrderInvoice(order(), RYE);
        expect(doc.sellerAddress).toBe(RYE.address);
        expect(buildOrderInvoice(order(), UNREGISTERED).sellerAddress).toBe(
            RYE.address,
        );
        const manual = buildManualInvoice(
            [
                {
                    description: "Cake",
                    quantity: 1,
                    unitCents: 50000,
                    rateBps: 500,
                    code: "1905",
                },
            ],
            RYE,
            null,
            0,
        );
        expect(manual.sellerAddress).toBe(RYE.address);
        // The correction carries the original's address, not today's.
        const cn = buildCreditNote(
            {
                sellerGstin: doc.sellerGstin,
                sellerState: doc.sellerState,
                sellerAddress:
                    "Old Shop, 1 MG Road, Bengaluru 560001, Karnataka",
                placeOfSupply: doc.placeOfSupply,
                taxType: doc.taxType,
                tax: "0",
                total: (doc.totalCents / 100).toFixed(2),
                lines: [],
            },
            1000,
        );
        expect(cn.sellerAddress).toBe(
            "Old Shop, 1 MG Road, Bengaluru 560001, Karnataka",
        );
    });
});
