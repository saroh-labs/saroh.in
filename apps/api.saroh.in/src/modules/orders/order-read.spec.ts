import type { RawOrderRead } from "./order-read";
import { amountDueCents, serializeOrderRead, undoableStep } from "./order-read";
import { UNDO_WINDOW_MS } from "./order-stage";

const at = new Date("2026-09-27T10:00:00Z");

const event = (over: Partial<RawOrderRead["events"][number]> = {}) => ({
    id: "ev_1",
    kind: "STAGE",
    actorUserId: "user_1",
    fromStage: "NEW",
    toStage: "PREPARING",
    fromStatus: "PENDING",
    toStatus: "PROCESSING",
    note: null,
    amountCents: null,
    undoneAt: null,
    undoesEventId: null,
    createdAt: at,
    ...over,
});

const base: RawOrderRead = {
    id: "order_1",
    orderId: "ORD-042",
    createdAt: at,
    updatedAt: at,
    status: "PROCESSING",
    paymentStatus: "PAID",
    stage: "PREPARING",
    fulfilment: "DELIVERY",
    currency: "INR",
    subtotal: "360.00",
    tax: "0.00",
    shipping: "40.00",
    discount: "0.00",
    total: "400.00",
    notes: null,
    trackingUrl: null,
    deliveryName: null,
    deliveryPhone: null,
    deliveryLine1: "12 MG Road",
    deliveryLine2: null,
    deliveryCity: "Bengaluru",
    deliveryState: "Karnataka",
    deliveryPostalCode: "560001",
    store: { id: "store_1", name: "Rye & Co." },
    customer: null,
    items: [
        {
            id: "li_1",
            productId: "p_1",
            quantity: 3,
            price: "120.00",
            product: { name: "Croissant" },
            variant: null,
            refundLines: [{ quantity: 1, amountCents: 12000 }],
        },
    ],
    events: [event()],
    paymentIntents: [
        {
            amountCents: 40000,
            refunds: [{ amountCents: 12000, forEdit: false }],
        },
    ],
    discountRedemption: null,
};

const opts = (money: boolean) => ({
    money,
    fullRead: money,
    actors: new Map([["user_1", "Meera"]]),
    now: new Date(at.getTime() + 1000),
});

describe("serializeOrderRead", () => {
    it("reads a partial refund as partly refunded, with the line's refunded count", () => {
        const read = serializeOrderRead(base, opts(true));
        expect(read.refundStanding).toBe("PARTLY_REFUNDED");
        expect(read.paymentStatus).toBe("PAID");
        expect(read.items[0].refundedQuantity).toBe(1);
        expect(read.money).toMatchObject({
            paid: "400.00",
            refunded: "120.00",
            due: "0.00",
        });
    });

    it("lists the order's paper only for a role that reads invoices (ADR-008)", () => {
        const paper = [
            {
                id: "inv_1",
                number: "RC/26-27/0001",
                kind: "INVOICE",
                status: "PAID",
            },
            {
                id: "cn_1",
                number: "RCCN/26-27/0001",
                kind: "CREDIT_NOTE",
                status: "ISSUED",
            },
        ];
        const withPaper = { ...base, invoices: paper };
        expect(serializeOrderRead(withPaper, opts(true)).invoices).toBeNull();
        expect(
            serializeOrderRead(withPaper, { ...opts(true), invoiceRead: true })
                .invoices,
        ).toEqual(paper);
    });

    it("carries the address with its state, for delivery and for GST", () => {
        expect(serializeOrderRead(base, opts(false)).deliveryAddress).toEqual(
            expect.objectContaining({
                state: "Karnataka",
                postalCode: "560001",
            }),
        );
        expect(
            serializeOrderRead(
                {
                    ...base,
                    deliveryLine1: null,
                    deliveryCity: null,
                    deliveryState: null,
                    deliveryPostalCode: null,
                },
                opts(false),
            ).deliveryAddress,
        ).toBeNull();
    });

    it("without a money read, no figure leaves the API", () => {
        const read = serializeOrderRead(
            {
                ...base,
                events: [
                    event(),
                    event({ id: "ev_2", kind: "REFUND", amountCents: 12000 }),
                ],
            },
            opts(false),
        );
        expect(read.money).toBeNull();
        expect(read.items[0]).not.toHaveProperty("price");
        for (const e of read.events)
            expect(e).not.toHaveProperty("amountCents");
        const text = JSON.stringify(read);
        expect(text).not.toContain("120");
        expect(text).not.toContain("400");
    });
});

describe("undoableStep", () => {
    it("offers the last kitchen step until the window closes", () => {
        expect(undoableStep([event()], at)?.eventId).toBe("ev_1");
        expect(
            undoableStep(
                [event()],
                new Date(at.getTime() + UNDO_WINDOW_MS + 1),
            ),
        ).toBeNull();
    });

    it("offers nothing after an undo, or when the last step was not a kitchen step", () => {
        expect(
            undoableStep(
                [event({ undoneAt: at }), event({ id: "ev_2", kind: "UNDO" })],
                at,
            ),
        ).toBeNull();
        expect(
            undoableStep([event(), event({ id: "ev_2", kind: "REFUND" })], at),
        ).toBeNull();
    });
});

describe("amountDueCents", () => {
    const order = (
        total: string,
        refunds: { amountCents: number; forEdit: boolean }[] = [],
    ) => ({
        total,
        status: "PENDING",
        paymentStatus: "PAID",
        paymentIntents: [{ amountCents: 36000, refunds }],
    });

    it("an order edited up owes the difference until it is paid", () => {
        expect(amountDueCents(order("480.00"))).toBe(12000);
    });

    it("an order edited down and refunded the difference owes nothing", () => {
        expect(
            amountDueCents(
                order("240.00", [{ amountCents: 12000, forEdit: true }]),
            ),
        ).toBe(0);
    });

    it("a line refund never makes money due", () => {
        expect(
            amountDueCents(
                order("360.00", [{ amountCents: 12000, forEdit: false }]),
            ),
        ).toBe(0);
    });

    it("names each line's allergens by kind, and the customer's confirmed contact", () => {
        const read = serializeOrderRead(
            {
                ...base,
                customer: {
                    id: "cus_1",
                    email: "priya@example.in",
                    firstName: "Priya",
                    lastName: "Raman",
                    phone: null,
                    identityLinks: [{ contactId: "con_1" }],
                    orders: [{ createdAt: at }],
                    _count: { orders: 6 },
                },
                items: [
                    {
                        ...base.items[0],
                        product: {
                            name: "Seeded rye",
                            allergens: [
                                {
                                    kind: "CONTAINS",
                                    allergen: { id: "al_g", name: "Gluten" },
                                },
                                {
                                    kind: "MAY_CONTAIN",
                                    allergen: { id: "al_s", name: "Sesame" },
                                },
                            ],
                        },
                    },
                ],
            },
            opts(false),
        );
        expect(read.items[0].allergens).toEqual({
            contains: [{ id: "al_g", name: "Gluten" }],
            mayContain: [{ id: "al_s", name: "Sesame" }],
        });
        expect(read.customer).toEqual(
            expect.objectContaining({
                contactId: "con_1",
                orderCount: 6,
                firstOrderAt: at,
            }),
        );
        // The kitchen's view still has no inbox in it.
        expect(read.customer).not.toHaveProperty("email");
    });

    it("says a customer is unlinked rather than guessing by email", () => {
        const read = serializeOrderRead(
            {
                ...base,
                customer: {
                    id: "cus_1",
                    email: "priya@example.in",
                    firstName: "Priya",
                    lastName: null,
                    phone: null,
                },
            },
            opts(true),
        );
        expect(read.customer?.contactId).toBeNull();
        expect(read.items[0].allergens).toEqual({
            contains: [],
            mayContain: [],
        });
    });
});
