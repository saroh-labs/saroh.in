import { describe, expect, it } from "vitest";

import { cleanHandoff } from "./handoff";

const good = {
    provider: "RAZORPAY",
    keyId: "rzp_test_abc",
    subscriptionId: "sub_1",
    orderId: null,
    amountPaise: null,
    currency: "INR",
    prefill: {
        name: "Shop",
        email: "o@example.test",
        contact: "+919800000000",
    },
};

describe("cleanHandoff", () => {
    it("keeps a subscription's window as given", () => {
        expect(cleanHandoff(good)).toEqual(good);
    });

    it("keeps an order's window with its amount", () => {
        expect(
            cleanHandoff({
                ...good,
                subscriptionId: null,
                orderId: "order_1",
                amountPaise: 826,
            }),
        ).toMatchObject({ orderId: "order_1", amountPaise: 826 });
    });

    it("reads anything else as no window", () => {
        expect(cleanHandoff(null)).toBeNull();
        expect(cleanHandoff({ ...good, provider: "OTHER" })).toBeNull();
        expect(cleanHandoff({ ...good, keyId: "bad key" })).toBeNull();
        expect(
            cleanHandoff({ ...good, subscriptionId: null, orderId: null }),
        ).toBeNull();
    });
});
