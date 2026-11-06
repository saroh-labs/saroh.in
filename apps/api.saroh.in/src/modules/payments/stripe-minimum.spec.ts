// Stripe's least charge (DEC-208): refused at set-up while the business
// takes payment through Stripe; Razorpay and Cashfree never asked.
import { BadRequestException } from "@nestjs/common";

import { assertStripeTakes, belowStripeMinimum } from "./stripe-minimum";

function db(stripeConnections: number) {
    return {
        merchantPaymentProvider: {
            count: jest.fn().mockResolvedValue(stripeConnections),
        },
    };
}

describe("belowStripeMinimum", () => {
    it.each([
        [49, "USD", "Stripe can't take less than $0.50 in one payment."],
        [29, "gbp", "Stripe can't take less than £0.30 in one payment."],
        [199, "AED", /AED\s?2\.00/],
    ])("refuses %p %s", (cents, currency, message) => {
        expect(belowStripeMinimum(cents, currency)).toMatch(message);
    });

    it.each([
        [50, "USD"],
        [0, "USD"],
        [1, "JPY"],
    ])(
        "takes %p %s (at the minimum, nothing, or no known minimum)",
        (cents, currency) => {
            expect(belowStripeMinimum(cents, currency)).toBeNull();
        },
    );
});

describe("assertStripeTakes", () => {
    it("refuses under the field that set it when the business takes Stripe", async () => {
        const d = db(1);
        const err = await assertStripeTakes(
            d as never,
            "org_1",
            { amountCents: 25, currency: "USD" },
            "depositMode",
        ).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(BadRequestException);
        expect((err as BadRequestException).getResponse()).toEqual({
            message: "Stripe can't take less than $0.50 in one payment.",
            details: { field: "depositMode" },
        });
        expect(d.merchantPaymentProvider.count).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                provider: "STRIPE",
                status: "CONNECTED",
            },
        });
    });

    it("lets a business without Stripe set any price, India's as before", async () => {
        const d = db(0);
        await expect(
            assertStripeTakes(
                d as never,
                "org_1",
                { amountCents: 40, currency: "INR" },
                "price",
            ),
        ).resolves.toBeUndefined();
    });

    it("asks nothing for an amount Stripe takes, or one not set yet", async () => {
        const d = db(1);
        await assertStripeTakes(
            d as never,
            "org_1",
            { amountCents: 5000, currency: "USD" },
            "price",
        );
        await assertStripeTakes(
            d as never,
            "org_1",
            { amountCents: null, currency: "USD" },
            "price",
        );
        await assertStripeTakes(
            d as never,
            "org_1",
            { amountCents: 10, currency: null },
            "price",
        );
        expect(d.merchantPaymentProvider.count).not.toHaveBeenCalled();
    });
});
