import { describe, expect, it } from "vitest";

import {
    PACK_TROUBLE,
    packAttemptAnswer,
    packCheckoutAnswer,
    packsOnSaleResult,
} from "./account-packs-shape";

/**
 * Buying a class pack (round-2 plan A, A11): the API's answers are checked
 * before a page sees them, and a refusal reaches the customer only in words
 * written for them.
 */

const PACK = {
    ref: "pack_1",
    name: "10-class pack",
    description: null,
    credits: 10,
    validityDays: 60,
    price: "4500.00",
    currency: "INR",
};

const STARTED = {
    ref: "inv_1",
    pack: { name: "10-class pack", credits: 10, validityDays: 60 },
    total: "4500.00",
    currency: "INR",
    payment: {
        paymentIntentId: "pi_1",
        provider: "RAZORPAY",
        providerIntentId: "order_1",
        amountCents: 450000,
        currency: "INR",
        publicKey: "rzp_test_1",
        clientParams: { razorpayOrderId: "order_1" },
    },
};

describe("the packs on sale", () => {
    it("takes a well-formed answer and refuses anything else", () => {
        expect(packsOnSaleResult({ payOnline: true, packs: [PACK] })).toEqual({
            payOnline: true,
            packs: [PACK],
        });
        expect(packsOnSaleResult({ payOnline: true })).toBeNull();
        expect(
            packsOnSaleResult({
                payOnline: true,
                packs: [{ ...PACK, credits: 0 }],
            }),
        ).toBeNull();
        expect(packsOnSaleResult(null)).toBeNull();
    });

    it("keeps a pack's kind, so the sheet can say sessions (A11)", () => {
        const pt = { ...PACK, kind: "ONE_TO_ONE" };
        expect(
            packsOnSaleResult({ payOnline: true, packs: [pt] })?.packs[0]?.kind,
        ).toBe("ONE_TO_ONE");
        // An older API sends no kind: still a pack on sale.
        expect(
            packsOnSaleResult({ payOnline: true, packs: [PACK] }),
        ).not.toBeNull();
        expect(
            packsOnSaleResult({
                payOnline: true,
                packs: [{ ...PACK, kind: "SOMETHING" }],
            }),
        ).toBeNull();
    });
});

describe("starting to pay for a pack", () => {
    it("passes a started payment on", () => {
        expect(packCheckoutAnswer(201, STARTED)).toEqual({
            ok: true,
            data: STARTED,
        });
    });

    it("refuses a malformed start as trouble, never half a payment", () => {
        expect(
            packCheckoutAnswer(201, { ...STARTED, payment: { provider: "X" } }),
        ).toEqual({ ok: false, message: PACK_TROUBLE });
    });

    it("passes on the refusals written for the customer", () => {
        const desk = {
            error: {
                message:
                    "This business isn't taking payments online right now. Buy the pack at the desk.",
                details: { reason: "desk" },
            },
        };
        expect(packCheckoutAnswer(409, desk)).toEqual({
            ok: false,
            message: desk.error.message,
        });
        expect(
            packCheckoutAnswer(429, { error: { message: "Too many tries." } }),
        ).toEqual({ ok: false, message: "Too many tries." });
    });

    it("words the rest itself", () => {
        expect(packCheckoutAnswer(404, { error: { message: "x" } })).toEqual({
            ok: false,
            message: "That pack isn't on sale any more. Refresh the page.",
        });
        expect(packCheckoutAnswer(401, null).ok).toBe(false);
        expect(
            packCheckoutAnswer(500, { error: { message: "stack trace" } }),
        ).toEqual({ ok: false, message: PACK_TROUBLE });
    });
});

describe("how a pack payment stands", () => {
    it("takes paying, bought and closed, and nothing else", () => {
        const bought = {
            state: "bought",
            pack: { name: "10-class pack", credits: 10 },
            expiresAt: "2026-11-30T10:00:00.000Z",
        };
        expect(packAttemptAnswer(200, bought)).toEqual({
            ok: true,
            data: bought,
        });
        expect(packAttemptAnswer(200, { ...bought, state: "maybe" }).ok).toBe(
            false,
        );
        expect(packAttemptAnswer(404, null)).toEqual({
            ok: false,
            message: "That payment isn't on your account.",
        });
    });
});
