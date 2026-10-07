import type { ConfirmationRow } from "./checkout-confirmation";
import { confirmationView } from "./checkout-confirmation";

/** The site's order confirmation (round-2 P4), pure. */

function row(over: Partial<ConfirmationRow> = {}): ConfirmationRow {
    return {
        orderId: "ORD-019",
        createdAt: new Date("2026-09-29T08:00:00Z"),
        paidAt: new Date("2026-09-29T08:02:00Z"),
        currency: "INR",
        subtotal: "500",
        shipping: "0",
        discount: "0",
        total: "500",
        paymentStatus: "PAID",
        fulfilment: "PICKUP",
        deliveryName: null,
        deliveryLine1: null,
        deliveryLine2: null,
        deliveryCity: null,
        deliveryState: null,
        deliveryPostalCode: null,
        store: {
            name: "Hill Road",
            settings: { address: "12 Hill Road, Bandra" },
        },
        items: [
            {
                quantity: 2,
                price: "250",
                product: { name: "Sourdough" },
                service: null,
                variant: { title: "Large" },
            },
        ],
        ...over,
    };
}

describe("confirmationView (P4)", () => {
    it("reads a pick-up order: its lines, money and where to collect it", () => {
        expect(confirmationView(row())).toEqual({
            orderNumber: "ORD-019",
            placedAt: "2026-09-29T08:02:00.000Z",
            currency: "INR",
            lines: [
                {
                    name: "Sourdough",
                    variant: "Large",
                    quantity: 2,
                    amount: "500.00",
                },
            ],
            subtotal: "500.00",
            delivery: null,
            discount: null,
            total: "500.00",
            fulfilment: {
                type: "PICKUP",
                label: "Pick-up",
                pickup: {
                    name: "Hill Road",
                    address: "12 Hill Road, Bandra",
                    hours: null,
                },
                deliverTo: null,
            },
            refunded: false,
            toPay: null,
        });
    });

    it("says what is still to pay on an order paid at the handover", () => {
        expect(
            confirmationView(
                row({ payOnHandover: true, paymentStatus: "UNPAID" }),
            ).toPay,
        ).toBe("Pay when you collect");
        expect(
            confirmationView(
                row({
                    payOnHandover: true,
                    paymentStatus: "UNPAID",
                    fulfilment: "LOCAL_DELIVERY",
                }),
            ).toPay,
        ).toBe("Pay on delivery");
        // Paid at the counter since: nothing left to pay.
        expect(
            confirmationView(
                row({ payOnHandover: true, paymentStatus: "PAID" }),
            ).toPay,
        ).toBeNull();
    });

    it("reads a delivery: the fee and the address as they typed it", () => {
        const view = confirmationView(
            row({
                fulfilment: "LOCAL_DELIVERY",
                shipping: "60",
                total: "560",
                deliveryName: "Asha Rao",
                deliveryLine1: "Flat 4, Sea View",
                deliveryLine2: "  ",
                deliveryCity: "Mumbai",
                deliveryState: "Maharashtra",
                deliveryPostalCode: "400050",
            }),
        );
        expect(view.delivery).toBe("60.00");
        expect(view.total).toBe("560.00");
        expect(view.fulfilment).toEqual({
            type: "LOCAL_DELIVERY",
            label: "Local delivery",
            pickup: null,
            deliverTo: {
                name: "Asha Rao",
                lines: ["Flat 4, Sea View", "Mumbai, Maharashtra 400050"],
            },
        });
    });

    it("never invents an address or a pick-up place it doesn't have", () => {
        const shipped = confirmationView(row({ fulfilment: "SHIPPING" }));
        expect(shipped.fulfilment.deliverTo).toBeNull();
        expect(shipped.fulfilment.pickup).toBeNull();
        const noAddress = confirmationView(
            row({ store: { name: "Online", settings: null } }),
        );
        expect(noAddress.fulfilment.pickup).toEqual({
            name: "Online",
            address: null,
            hours: null,
        });
    });

    it("says when the place is open (UX-025)", () => {
        const view = confirmationView(
            row({
                store: {
                    name: "Hill Road",
                    settings: {
                        address: "12 Hill Road",
                        openingHours: [
                            {
                                day: "MON",
                                open: "10:00",
                                close: "19:00",
                                closed: false,
                            },
                            {
                                day: "TUE",
                                open: "10:00",
                                close: "19:00",
                                closed: false,
                            },
                            {
                                day: "WED",
                                open: "10:00",
                                close: "19:00",
                                closed: false,
                            },
                            {
                                day: "THU",
                                open: "10:00",
                                close: "19:00",
                                closed: false,
                            },
                            {
                                day: "FRI",
                                open: "10:00",
                                close: "19:00",
                                closed: false,
                            },
                            {
                                day: "SAT",
                                open: "10:00",
                                close: "19:00",
                                closed: false,
                            },
                            {
                                day: "SUN",
                                open: "10:00",
                                close: "19:00",
                                closed: true,
                            },
                        ],
                    },
                },
            }),
        );
        expect(view.fulfilment.pickup?.hours).toBe(
            "Mon–Sat 10:00–19:00, Sun closed",
        );
    });

    it("falls back to when it was made, and says a later refund", () => {
        const view = confirmationView(
            row({ paidAt: null, paymentStatus: "REFUNDED", discount: "50" }),
        );
        expect(view.placedAt).toBe("2026-09-29T08:00:00.000Z");
        expect(view.refunded).toBe(true);
        expect(view.discount).toBe("50.00");
    });

    it("names a line by its product, its service, or plainly", () => {
        const view = confirmationView(
            row({
                items: [
                    {
                        quantity: 1,
                        price: "99.5",
                        product: null,
                        service: { name: "Consultation" },
                        variant: null,
                    },
                    {
                        quantity: 3,
                        price: "10",
                        product: null,
                        service: null,
                        variant: null,
                    },
                ],
            }),
        );
        expect(view.lines).toEqual([
            {
                name: "Consultation",
                variant: null,
                quantity: 1,
                amount: "99.50",
            },
            { name: "Item", variant: null, quantity: 3, amount: "30.00" },
        ]);
    });
});
