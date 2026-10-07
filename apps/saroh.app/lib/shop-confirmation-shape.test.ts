import { describe, expect, it } from "vitest";

import {
    confirmationLookup,
    confirmationOf,
    isOrderRef,
} from "./shop-confirmation-shape";

/** The order confirmation page's answer (round-2 P4), checked and rebuilt. */

const BODY = {
    orderNumber: "ORD-019",
    placedAt: "2026-09-29T08:02:00.000Z",
    currency: "INR",
    lines: [
        { name: "Sourdough", variant: "Large", quantity: 2, amount: "500.00" },
    ],
    subtotal: "500.00",
    delivery: null,
    discount: null,
    total: "500.00",
    fulfilment: {
        type: "PICKUP",
        label: "Pick-up",
        pickup: { name: "Hill Road", address: null },
        deliverTo: null,
    },
    refunded: false,
    toPay: null,
};

describe("confirmationOf", () => {
    it("rebuilds the API's confirmation, and nothing else", () => {
        const withExtra = {
            ...BODY,
            providerPaymentId: "pay_secret",
            lines: [{ ...BODY.lines[0], stockLevelId: "sl_1" }],
        };
        const order = confirmationOf(withExtra);
        expect(order).toEqual(BODY);
        expect(order).not.toHaveProperty("providerPaymentId");
        expect(order?.lines[0]).not.toHaveProperty("stockLevelId");
    });

    it("keeps when the pick-up place is open (UX-025)", () => {
        const open = {
            ...BODY,
            fulfilment: {
                ...BODY.fulfilment,
                pickup: {
                    name: "Hill Road",
                    address: "12 Hill Road",
                    hours: "Mon–Sat 10:00–19:00, Sun closed",
                },
            },
        };
        expect(confirmationOf(open)?.fulfilment.pickup).toEqual({
            name: "Hill Road",
            address: "12 Hill Road",
            hours: "Mon–Sat 10:00–19:00, Sun closed",
        });
    });

    it("reads a delivery address", () => {
        const delivered = {
            ...BODY,
            delivery: "60.00",
            fulfilment: {
                type: "LOCAL_DELIVERY",
                label: "Local delivery",
                pickup: null,
                deliverTo: { name: null, lines: ["Flat 4", "Mumbai 400050"] },
            },
        };
        expect(confirmationOf(delivered)?.fulfilment.deliverTo).toEqual({
            name: null,
            lines: ["Flat 4", "Mumbai 400050"],
        });
    });

    it("refuses anything malformed", () => {
        expect(confirmationOf(null)).toBeNull();
        expect(confirmationOf([])).toBeNull();
        expect(confirmationOf({ ...BODY, total: 500 })).toBeNull();
        expect(confirmationOf({ ...BODY, refunded: "no" })).toBeNull();
        expect(
            confirmationOf({ ...BODY, lines: [{ name: "Sourdough" }] }),
        ).toBeNull();
        expect(
            confirmationOf({
                ...BODY,
                fulfilment: { ...BODY.fulfilment, pickup: { name: 1 } },
            }),
        ).toBeNull();
        expect(
            confirmationOf({
                ...BODY,
                fulfilment: {
                    ...BODY.fulfilment,
                    deliverTo: { name: null, lines: [1] },
                },
            }),
        ).toBeNull();
    });
});

describe("an order paid at the handover (2026-10-06)", () => {
    it("keeps what is still to pay, and reads an older API's answer as nothing", () => {
        expect(
            confirmationOf({ ...BODY, toPay: "Pay when you collect" })?.toPay,
        ).toBe("Pay when you collect");
        const { toPay: _gone, ...older } = BODY;
        expect(confirmationOf(older)?.toPay).toBeNull();
    });
});

describe("confirmationLookup", () => {
    it("says why there is no order to show", () => {
        expect(confirmationLookup(200, BODY)).toEqual({
            ok: true,
            order: BODY,
        });
        expect(confirmationLookup(401, null)).toEqual({
            ok: false,
            reason: "signed-out",
        });
        expect(confirmationLookup(404, null)).toEqual({
            ok: false,
            reason: "missing",
        });
        expect(confirmationLookup(500, null)).toEqual({
            ok: false,
            reason: "unavailable",
        });
        // A 200 that doesn't hold an order is the API's trouble, not "missing".
        expect(confirmationLookup(200, { nope: true })).toEqual({
            ok: false,
            reason: "unavailable",
        });
    });
});

describe("isOrderRef", () => {
    it("takes only an order id's characters", () => {
        expect(isOrderRef("cmg1abc_-9")).toBe(true);
        expect(isOrderRef("../account")).toBe(false);
        expect(isOrderRef("")).toBe(false);
        expect(isOrderRef("a".repeat(65))).toBe(false);
    });
});
