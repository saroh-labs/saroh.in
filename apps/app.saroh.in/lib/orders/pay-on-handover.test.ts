import { describe, expect, it } from "vitest";

import { handoverPayment } from "@/lib/orders/pay-on-handover";

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
