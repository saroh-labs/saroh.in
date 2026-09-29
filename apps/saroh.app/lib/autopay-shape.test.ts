import { describe, expect, it } from "vitest";

import {
    AUTOPAY_TROUBLE,
    autopayDoneAnswer,
    autopayReadOf,
    autopayStartAnswer,
    joinDoneAnswer,
} from "./autopay-shape";
import { payAutopayOf } from "./invoice-pay-shape";

/**
 * Autopay's answers as the site's server reads them (round-2 D12): a start
 * checked field by field, the customer's own refusals passed on and the
 * rest in the page's words, and the page after set-up read from its
 * address.
 */

const START = {
    ref: "m_1",
    method: "UPI",
    mode: "PAY_AND_AUTHORISE",
    limit: "3800.00",
    currency: "INR",
    handoff: {
        provider: "RAZORPAY",
        amountCents: 250000,
        currency: "INR",
        providerIntentId: "order_auth",
        publicKey: "rzp_test_1",
        clientParams: { razorpayOrderId: "order_auth", recurring: true },
    },
    authorisationUrl: null,
    returnUrl: "https://pulse.saroh.app/autopay?pay=tok",
};

const OUTCOME = {
    plan: "Monthly unlimited",
    autopay: { state: "ON", method: "UPI", hint: "mo•••@okicici" },
    paid: true,
    nextPaymentAt: "2026-11-01T18:30:00.000Z",
    nextAmount: "2500.00",
    currency: "INR",
    timezone: "Asia/Kolkata",
};

describe("starting autopay", () => {
    it("hands the page the window to open and where to land", () => {
        expect(autopayStartAnswer(201, START)).toEqual({
            ok: true,
            data: START,
        });
    });

    it("passes on the customer's own refusals, and words the rest itself", () => {
        const refused = (status: number, message: string) =>
            autopayStartAnswer(status, { error: { message } });
        expect(
            refused(
                409,
                "Autopay isn't available with this business. Pay this time as usual.",
            ),
        ).toEqual({
            ok: false,
            message:
                "Autopay isn't available with this business. Pay this time as usual.",
        });
        expect(refused(404, "Subscription not found")).toMatchObject({
            message: "That plan isn't on your account. Refresh the page.",
        });
        expect(refused(500, "boom")).toEqual({
            ok: false,
            message: AUTOPAY_TROUBLE,
        });
        expect(autopayStartAnswer(201, { ref: "m_1" })).toEqual({
            ok: false,
            message: AUTOPAY_TROUBLE,
        });
    });
});

describe("the page after set-up", () => {
    it("reads its address: a pay link's token, or a plan or a join of theirs", () => {
        expect(autopayReadOf({ pay: "tok_1" })).toEqual({
            kind: "pay",
            token: "tok_1",
        });
        expect(autopayReadOf({ plan: "sub_1" })).toEqual({
            kind: "plan",
            ref: "sub_1",
        });
        expect(autopayReadOf({ join: "inv_1" })).toEqual({
            kind: "join",
            ref: "inv_1",
        });
        expect(autopayReadOf({})).toBeNull();
        expect(autopayReadOf({ plan: "../me" })).toBeNull();
        expect(autopayReadOf({ plan: ["a", "b"] })).toBeNull();
    });

    it("reads an outcome, a signed-out session and trouble", () => {
        expect(autopayDoneAnswer(200, OUTCOME)).toEqual({
            kind: "outcome",
            outcome: OUTCOME,
        });
        expect(autopayDoneAnswer(401, null)).toEqual({ kind: "signed-out" });
        expect(autopayDoneAnswer(404, null)).toEqual({ kind: "error" });
        expect(autopayDoneAnswer(200, { plan: "x" })).toEqual({
            kind: "error",
        });
    });

    it("reads a join: still paying, joined with its autopay, or closed", () => {
        expect(
            joinDoneAnswer(200, { state: "paying", plan: "M", outcome: null }),
        ).toEqual({ kind: "joining" });
        expect(
            joinDoneAnswer(200, {
                state: "joined",
                plan: "M",
                outcome: OUTCOME,
            }),
        ).toEqual({ kind: "outcome", outcome: OUTCOME });
        expect(
            joinDoneAnswer(200, { state: "closed", plan: "M", outcome: null }),
        ).toEqual({ kind: "closed", plan: "M" });
    });
});

describe("the pay page's autopay", () => {
    it("keeps the provider's methods and whether it is on, nothing else", () => {
        expect(
            payAutopayOf({
                plan: "Monthly",
                methods: ["UPI", "EMANDATE", "WALLET"],
                on: null,
            }),
        ).toEqual({ plan: "Monthly", methods: ["UPI", "EMANDATE"], on: null });
        expect(
            payAutopayOf({
                plan: "Monthly",
                methods: [],
                on: { method: "CARD", hint: "•••• 4242" },
            }),
        ).toEqual({
            plan: "Monthly",
            methods: [],
            on: { method: "CARD", hint: "•••• 4242" },
        });
        expect(payAutopayOf(null)).toBeNull();
    });
});
