import { describe, expect, it } from "vitest";

import {
    handoverPayment,
    uncollectedHeading,
} from "@/lib/orders/pay-on-handover";

/**
 * An order placed on the website to be paid at the handover (2026-10-06):
 * Order Detail says how it is settled while it is still to pay.
 */
describe("handoverPayment", () => {
    const order = {
        status: "PENDING" as const,
        paymentStatus: "UNPAID" as const,
        fulfilmentType: "PICKUP" as const,
        payOnHandover: true,
    };

    it("says collection for a pick-up, delivery for a local delivery", () => {
        expect(handoverPayment(order)).toBe("collection");
        expect(
            handoverPayment({ ...order, fulfilmentType: "LOCAL_DELIVERY" }),
        ).toBe("delivery");
    });

    it("is nothing once paid or cancelled, or for any other order", () => {
        expect(handoverPayment({ ...order, paymentStatus: "PAID" })).toBeNull();
        expect(handoverPayment({ ...order, status: "CANCELLED" })).toBeNull();
        expect(handoverPayment({ ...order, payOnHandover: false })).toBeNull();
        expect(
            handoverPayment({ ...order, payOnHandover: undefined }),
        ).toBeNull();
    });
});

/** R34: nobody came for it in three days, counted by the API. */
describe("uncollectedHeading", () => {
    it("says how long it has waited, in the order's own words", () => {
        expect(uncollectedHeading("collection", 3)).toBe(
            "Not collected for 3 days",
        );
        expect(uncollectedHeading("delivery", 5)).toBe(
            "Not delivered for 5 days",
        );
    });

    it("is nothing while the API sends no count", () => {
        expect(uncollectedHeading("collection", null)).toBeNull();
        expect(uncollectedHeading("collection", undefined)).toBeNull();
    });
});
