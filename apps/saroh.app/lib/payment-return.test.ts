import { describe, expect, it, vi } from "vitest";

import { packCheckoutAnswer } from "./account-packs-shape";
import { checkoutClosed } from "./checkout-closed";
import { checkoutClosedOf, intentBody } from "./invoice-pay";
import { paidQueryOf } from "./payment-return";
import { joinStartAnswer } from "./plan-join-shape";
import { problemOf, startBody } from "./shop-checkout-shape";

vi.mock("./api-url", () => ({
    serverApiUrl: () => "https://api.test",
    serverReadSignal: () => undefined,
}));
vi.mock("./relay-headers", () => ({
    withRelay: (h: Record<string, string>) => Promise.resolve(h),
}));

/**
 * Stripe's hosted Checkout on the site (U8): what the `/paid` address may
 * ask for, the return path each create-intent call sends on (a same-site
 * path only), and a closed checkout said so every surface starts again.
 */

const CLOSED = {
    error: {
        message: "This checkout has closed. Start again.",
        details: { reason: "checkout-closed" },
    },
};

describe("the /paid address", () => {
    it("reads a session to show, or a cancel to make", () => {
        expect(paidQueryOf({ session_id: "cs_test_a1B2" })).toEqual({
            kind: "session",
            sessionId: "cs_test_a1B2",
        });
        expect(
            paidQueryOf({ cancelled: "1", intent: "int_1", token: "t-ok_9" }),
        ).toEqual({ kind: "cancel", intent: "int_1", token: "t-ok_9" });
    });

    it("is nothing (a 404) for anything else", () => {
        for (const query of [
            {},
            { session_id: "pi_123" },
            { session_id: "cs_../x" },
            { session_id: ["cs_1", "cs_2"] },
            { cancelled: "1", intent: "int_1" },
            { cancelled: "1", intent: "int 1", token: "t" },
        ]) {
            expect(paidQueryOf(query)).toBeNull();
        }
    });
});

describe("the page to come back to", () => {
    it("goes on only as a same-site path", () => {
        expect(JSON.parse(intentBody("k1", "/pay/tok_1"))).toEqual({
            idempotencyKey: "k1",
            returnPath: "/pay/tok_1",
        });
        for (const bad of ["//evil.example", "https://x", "/\\x", 7]) {
            expect(JSON.parse(intentBody("k1", bad))).toEqual({
                idempotencyKey: "k1",
            });
        }
        const lines = [{ listingId: "l1", variantId: null, quantity: 1 }];
        const base = {
            lines,
            fulfilment: "PICKUP",
            key: "key_12345678",
        };
        expect(
            startBody({ ...base, returnPath: "/shop?x=1" })?.returnPath,
        ).toBe("/shop?x=1");
        expect(
            startBody({ ...base, returnPath: "//evil.example" }),
        ).not.toHaveProperty("returnPath");
    });
});

describe("a closed checkout", () => {
    it("is told apart from any other 409, on every surface", () => {
        expect(checkoutClosed(409, CLOSED)).toBe(true);
        expect(checkoutClosed(409, { error: { details: {} } })).toBe(false);
        expect(checkoutClosed(503, CLOSED)).toBe(false);

        expect(checkoutClosedOf(409, CLOSED)).toMatchObject({
            ok: false,
            restart: true,
        });
        expect(problemOf(409, CLOSED).reason).toBe("checkout-closed");
        expect(joinStartAnswer(409, CLOSED)).toMatchObject({
            ok: false,
            reason: "checkout-closed",
        });
        expect(packCheckoutAnswer(409, CLOSED)).toMatchObject({
            ok: false,
            restart: true,
        });
    });
});
