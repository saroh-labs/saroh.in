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
    fulfilment: "LOCAL_DELIVERY",
    currency: "INR",
    subtotal: "360.00",
    tax: "0.00",
    shipping: "40.00",
    discount: "0.00",
    total: "400.00",
    notes: null,
    trackingUrl: null,
    courierName: null,
    trackingNumber: null,
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
            refunds: [
                {
                    id: "rf_1",
                    amountCents: 12000,
                    forEdit: false,
                    status: "SUCCEEDED",
                    providerRefundId: "rfnd_1",
                },
            ],
        },
    ],
    discountRedemption: null,
};

const opts = (money: boolean) => ({
    money,
    fullRead: money,
    contact: true,
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
            refundsBeingConfirmed: [],
            // Settled by its webhook: not on its way any more (B9).
            refundsOnTheWay: [],
        });
    });

    it("lists a refund whose provider answer was lost as being confirmed (#508)", () => {
        const read = serializeOrderRead(
            {
                ...base,
                paymentIntents: [
                    {
                        amountCents: 40000,
                        refunds: [
                            // Taken by the provider, waiting for its webhook.
                            {
                                id: "rf_taken",
                                amountCents: 5000,
                                forEdit: false,
                                status: "PENDING",
                                providerRefundId: "rfnd_1",
                            },
                            {
                                id: "rf_lost",
                                amountCents: 12000,
                                forEdit: false,
                                status: "PENDING",
                                providerRefundId: null,
                            },
                        ],
                    },
                ],
            },
            opts(true),
        );
        expect(read.money?.refundsBeingConfirmed).toEqual([
            { id: "rf_lost", amount: "120.00" },
        ]);
        // Taken by the provider, not confirmed yet: on its way (B9).
        expect(read.money?.refundsOnTheWay).toEqual([
            { id: "rf_taken", amount: "50.00" },
        ]);
        // Held: counted as handed back until the provider says.
        expect(read.money?.refunded).toBe("170.00");
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
        ).toEqual([
            // An unregistered business's paid paper is a receipt (D15).
            { ...paper[0], title: "Receipt" },
            { ...paper[1], title: "Credit note" },
        ]);
    });

    describe("names each paper as the invoice read does (D15)", () => {
        const read = (invoice: Record<string, unknown>) =>
            serializeOrderRead(
                {
                    ...base,
                    invoices: [
                        {
                            id: "inv_1",
                            number: "KD-0001",
                            kind: "INVOICE",
                            status: "PAID",
                            ...invoice,
                        },
                    ],
                },
                { ...opts(true), invoiceRead: true },
            ).invoices?.[0]?.title;

        it("a registered clinic's treatment, every line at 0%, is a bill of supply", () => {
            expect(
                read({
                    sellerGstin: "29ABCDE1234F1Z5",
                    lines: [{ gstRate: "0.00" }],
                }),
            ).toBe("Bill of supply");
        });

        it("a registered business's taxed paper is a tax invoice", () => {
            expect(
                read({
                    sellerGstin: "29ABCDE1234F1Z5",
                    lines: [{ gstRate: "0.00" }, { gstRate: "5.00" }],
                }),
            ).toBe("Tax invoice");
        });

        it("a line whose rate was never set is not exempt", () => {
            expect(
                read({
                    sellerGstin: "29ABCDE1234F1Z5",
                    lines: [{ gstRate: null }],
                }),
            ).toBe("Tax invoice");
        });

        it("an unregistered business's paper is an invoice until it is paid", () => {
            expect(read({ status: "ISSUED", dueAt: null })).toBe("Invoice");
            expect(read({ status: "PAID" })).toBe("Receipt");
        });
    });

    it("answers the type with its steps, and no legacy word (B2a, contracted by B2d)", () => {
        const read = serializeOrderRead(base, opts(false));
        expect(read).not.toHaveProperty("fulfilment");
        expect(read).toMatchObject({
            fulfilmentType: "LOCAL_DELIVERY",
            fulfilmentLabel: "Local delivery",
            stepIndex: 1,
            ticketName: "Packing slip",
        });
        // A local delivery goes out for delivery.
        expect(read.steps.map((s) => s.stage)).toEqual([
            "NEW",
            "PREPARING",
            "READY",
            "OUT_FOR_DELIVERY",
            "DELIVERED",
        ]);
        expect(
            serializeOrderRead(
                {
                    ...base,
                    fulfilment: "SHIPPING",
                    stage: "READY",
                    status: "PROCESSING",
                },
                opts(false),
            ),
        ).toMatchObject({
            fulfilmentType: "SHIPPING",
            stepIndex: 2,
            next: { stages: ["HANDED_TO_COURIER"] },
        });
        // A ready local delivery is offered Out for delivery, not a courier.
        expect(
            serializeOrderRead(
                {
                    ...base,
                    fulfilment: "LOCAL_DELIVERY",
                    stage: "READY",
                    status: "PROCESSING",
                },
                opts(false),
            ),
        ).toMatchObject({
            stepIndex: 2,
            next: { stages: ["OUT_FOR_DELIVERY"] },
        });
    });

    it("says whether it is late by its type's threshold, from when it was placed (B2b)", () => {
        const hours = (h: number) => ({
            ...opts(false),
            now: new Date(at.getTime() + h * 3_600_000),
        });
        // A local delivery gets 24 hours.
        expect(serializeOrderRead(base, hours(23))).toMatchObject({
            lateAfterMinutes: 1440,
            late: false,
            lateBy: null,
        });
        expect(serializeOrderRead(base, hours(26))).toMatchObject({
            lateAfterMinutes: 1440,
            late: true,
            lateBy: 120,
        });
        // A pick-up two hours; once collected it is never late.
        const pickup = { ...base, fulfilment: "PICKUP" };
        expect(serializeOrderRead(pickup, hours(3))).toMatchObject({
            lateAfterMinutes: 120,
            late: true,
            lateBy: 60,
        });
        expect(
            serializeOrderRead(
                { ...pickup, stage: "COLLECTED", status: "DELIVERED" },
                hours(3),
            ),
        ).toMatchObject({ late: false, lateBy: null });
    });

    it("carries the courier and tracking number (B2b)", () => {
        const read = serializeOrderRead(
            {
                ...base,
                stage: "HANDED_TO_COURIER",
                status: "SHIPPED",
                courierName: "Delhivery",
                trackingNumber: "AWB 4411",
                trackingUrl: "https://track.example/AWB4411",
            },
            opts(false),
        );
        expect(read).toMatchObject({
            courierName: "Delhivery",
            trackingNumber: "AWB 4411",
            trackingUrl: "https://track.example/AWB4411",
            late: false,
        });
        expect(serializeOrderRead(base, opts(false))).toMatchObject({
            courierName: null,
            trackingNumber: null,
        });
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
            { ...opts(false), contact: false },
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
        // A kitchen without contact:read has no inbox in it.
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

    it("reads a payment recorded by hand as paid in full, nothing due", () => {
        const read = serializeOrderRead(
            { ...base, paymentIntents: [] },
            opts(true),
        );
        expect(read.money).toEqual(
            expect.objectContaining({
                paid: "400.00",
                due: "0.00",
                recordedByHand: true,
            }),
        );
    });

    it("shows the variant's photo and SKU, falling back to the cover", () => {
        const line = (variant: RawOrderRead["items"][number]["variant"]) =>
            serializeOrderRead(
                {
                    ...base,
                    items: [
                        {
                            ...base.items[0],
                            product: { name: "Loaf", image: "cover.jpg" },
                            variant,
                        },
                    ],
                },
                opts(false),
            ).items[0];
        expect(
            line({ title: "800g", sku: "SD-800", photo: { url: "v.jpg" } }),
        ).toEqual(
            expect.objectContaining({ sku: "SD-800", imageUrl: "v.jpg" }),
        );
        expect(line(null)).toEqual(
            expect.objectContaining({ sku: null, imageUrl: "cover.jpg" }),
        );
    });
});

describe("serializeOrderRead: a treatment's order (E9, DEC-050)", () => {
    const treatment: RawOrderRead = {
        ...base,
        status: "PENDING",
        paymentStatus: "UNPAID",
        stage: "NEW",
        fulfilment: "APPOINTMENT_IN_PERSON",
        subtotal: "12000.00",
        shipping: "0.00",
        total: "12000.00",
        deliveryLine1: null,
        deliveryCity: null,
        deliveryState: null,
        deliveryPostalCode: null,
        items: [
            {
                id: "li_rct",
                productId: null,
                serviceId: "svc_rct",
                service: { name: "Root canal treatment" },
                quantity: 1,
                price: "12000.00",
                product: null,
                variant: null,
                refundLines: [],
            },
        ],
        events: [],
        // The deposit, paid on its booking's invoice at booking.
        paymentIntents: [{ amountCents: 600000, refunds: [] }],
    };

    it("names the service line, with no product, allergens or stock", () => {
        const read = serializeOrderRead(treatment, opts(true));
        expect(read.items).toEqual([
            expect.objectContaining({
                id: "li_rct",
                productId: null,
                serviceId: "svc_rct",
                kind: "service",
                name: "Root canal treatment",
                allergens: { contains: [], mayContain: [] },
                returnable: 0,
            }),
        ]);
    });

    it("isn't edited here: it changes through its visits", () => {
        expect(serializeOrderRead(treatment, opts(true)).next.editable).toBe(
            false,
        );
    });

    it("counts the deposit as paid and the rest as due", () => {
        expect(serializeOrderRead(treatment, opts(true)).money).toMatchObject({
            paid: "6000.00",
            due: "6000.00",
            recordedByHand: false,
        });
    });

    it("the balance recorded by hand: all of it paid, nothing due", () => {
        const paid = {
            ...treatment,
            paymentStatus: "PAID",
            balanceByHand: true,
        };
        expect(serializeOrderRead(paid, opts(true)).money).toMatchObject({
            paid: "12000.00",
            due: "0.00",
        });
        expect(amountDueCents(paid)).toBe(0);
    });
});

describe("the customer's own phone and email (review #19)", () => {
    const withCustomer: RawOrderRead = {
        ...base,
        deliveryName: "Priya",
        deliveryPhone: "+91 99000 00001",
        customer: {
            id: "cus_1",
            email: "priya@example.in",
            firstName: "Priya",
            lastName: null,
            phone: "+91 98450 00001",
        },
    };

    it("go to a caller holding contact:read and order:read", () => {
        const read = serializeOrderRead(withCustomer, {
            ...opts(true),
            contact: true,
        });
        expect(read.customer).toMatchObject({
            phone: "+91 98450 00001",
            email: "priya@example.in",
        });
    });

    it("the counter (contact:read, no order:read) gets the phone and the email", () => {
        const read = serializeOrderRead(withCustomer, {
            ...opts(false),
            contact: true,
        });
        expect(read.customer?.phone).toBe("+91 98450 00001");
        expect(read.customer?.email).toBe("priya@example.in");
    });

    it.each([true, false])(
        "never to one without it, whatever else they hold; the delivery phone stays (money read: %s)",
        (money) => {
            const read = serializeOrderRead(withCustomer, {
                ...opts(money),
                contact: false,
            });
            expect(read.customer?.phone).toBeNull();
            expect(read.customer).not.toHaveProperty("email");
            expect(read.customer?.name).toBe("Priya");
            // A local delivery can't go out without it.
            expect(read.deliveryAddress?.phone).toBe("+91 99000 00001");
            expect(JSON.stringify(read)).not.toContain("98450");
            expect(JSON.stringify(read)).not.toContain("priya@example.in");
        },
    );
});

// B13: a walk-in's order has no customer. It reads by the name they gave,
// and their phone goes only where a customer's would.
describe("a walk-in's order (B13)", () => {
    const walkIn: RawOrderRead = {
        ...base,
        customer: null,
        walkInName: "Asha",
        walkInPhone: "+91 98450 00002",
    };

    it("has no customer, and names the walk-in", () => {
        const read = serializeOrderRead(walkIn, {
            ...opts(true),
            contact: true,
        });
        expect(read.customer).toBeNull();
        expect(read.walkIn).toEqual({
            name: "Asha",
            phone: "+91 98450 00002",
        });
    });

    it("keeps their phone from a caller without contact:read", () => {
        const read = serializeOrderRead(walkIn, {
            ...opts(false),
            contact: false,
        });
        expect(read.walkIn).toEqual({ name: "Asha", phone: null });
        expect(JSON.stringify(read)).not.toContain("98450");
    });

    it("is null on an order with a customer", () => {
        const read = serializeOrderRead(
            {
                ...base,
                walkInName: null,
                customer: {
                    id: "cus_1",
                    email: "p@example.in",
                    firstName: "Priya",
                    lastName: null,
                    phone: null,
                },
            },
            opts(true),
        );
        expect(read.walkIn).toBeNull();
    });
});

describe("the order read's Needs attention (B15)", () => {
    const attention = {
        entries: [
            {
                id: "a1",
                kind: "ALLERGY" as const,
                label: "Sesame",
                detail: null,
                sensitive: false,
                allergen: { id: "al_s", name: "Sesame" },
                matchAllergens: [{ id: "al_s", name: "Sesame" }],
                source: "STAFF" as const,
            },
        ],
        hiddenSensitiveCount: 1,
    };

    it("carries what the caller may see, as the helper decided it", () => {
        const read = serializeOrderRead(base, { ...opts(false), attention });
        expect(read.attention).toEqual(attention);
    });

    it("is null when it couldn't be read, and absent when not asked for", () => {
        expect(
            serializeOrderRead(base, { ...opts(true), attention: null })
                .attention,
        ).toBeNull();
        expect(serializeOrderRead(base, opts(true))).not.toHaveProperty(
            "attention",
        );
    });
});
