import { describe, expect, it } from "vitest";

import {
    JOIN_TROUBLE,
    joinStandingAnswer,
    joinStartAnswer,
} from "./plan-join-shape";

const STARTED = {
    ref: "inv_1",
    plan: { name: "Monthly unlimited", interval: "MONTH" },
    total: "2500.00",
    currency: "INR",
    payment: {
        paymentIntentId: "pi_internal",
        provider: "RAZORPAY",
        providerIntentId: "order_1",
        amountCents: 250000,
        currency: "INR",
        publicKey: "rzp_test_1",
        clientParams: { razorpayOrderId: "order_1" },
    },
};

function refused(message: string, reason?: string) {
    return { error: { message, details: reason ? { reason } : {} } };
}

describe("starting to join (G20)", () => {
    it("hands the sheet the payment to open, and nothing else", () => {
        const answer = joinStartAnswer(201, STARTED);
        expect(answer.ok && answer.data).toEqual({
            ref: "inv_1",
            plan: { name: "Monthly unlimited", interval: "MONTH" },
            total: "2500.00",
            currency: "INR",
            payment: {
                provider: "RAZORPAY",
                providerIntentId: "order_1",
                amountCents: 250000,
                currency: "INR",
                publicKey: "rzp_test_1",
                clientParams: { razorpayOrderId: "order_1" },
            },
        });
    });

    it("a malformed success is trouble, not a crash", () => {
        expect(joinStartAnswer(201, { ref: "x" })).toEqual({
            ok: false,
            reason: "error",
            message: JOIN_TROUBLE,
        });
    });

    it("passes on the customer's own sentences, and says when to ask instead", () => {
        const ask =
            "This business isn't taking payments online right now. Ask them about joining.";
        expect(joinStartAnswer(409, refused(ask, "ask"))).toEqual({
            ok: false,
            reason: "ask",
            message: ask,
        });
        const already = "You're already on Monthly. See it in your account.";
        expect(joinStartAnswer(409, refused(already, "already-on"))).toEqual({
            ok: false,
            reason: "error",
            message: already,
        });
        expect(
            joinStartAnswer(429, refused("Too many tries just now.")),
        ).toMatchObject({
            reason: "error",
            message: "Too many tries just now.",
        });
    });

    it("signs in again after a 401, and never shows a server's own words", () => {
        expect(joinStartAnswer(401, null)).toMatchObject({
            ok: false,
            reason: "signed-out",
        });
        expect(joinStartAnswer(404, refused("Plan not found"))).toMatchObject({
            message: "That plan isn't on offer any more. Refresh the page.",
        });
        expect(
            joinStartAnswer(500, refused("PrismaClientKnownRequestError")),
        ).toEqual({ ok: false, reason: "error", message: JOIN_TROUBLE });
    });
});

describe("how a join stands", () => {
    it("reads paying, joined and closed", () => {
        for (const state of ["paying", "joined", "closed"]) {
            const body = { state, plan: { name: "Monthly" } };
            expect(joinStandingAnswer(200, body)).toEqual({
                ok: true,
                data: body,
            });
        }
    });

    it("says why it can't be read", () => {
        expect(joinStandingAnswer(200, { state: "bought" })).toMatchObject({
            ok: false,
        });
        expect(joinStandingAnswer(404, null)).toMatchObject({
            message: "That payment isn't on your account.",
        });
        expect(joinStandingAnswer(401, null)).toMatchObject({
            reason: "signed-out",
        });
    });
});
