import { describe, expect, it } from "vitest";

import { payNowAnswer, planChangeAnswer, planTabResult } from "./account-shape";

/**
 * The Plan tab's answers as this server reads them (round-2 plan A, A8): a
 * part that failed or came back strange stays "couldn't be loaded", a
 * refusal written for the member is passed on, and "Pay now" only ever
 * sends them to a pay page.
 */

const SUB = {
    ref: "sub_1",
    name: "Monthly 8",
    price: "2500.00",
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    renewsAt: "2026-10-17T18:30:00.000Z",
    pausedUntil: null,
    endsAt: null,
    timezone: "Asia/Kolkata",
    classes: { perMonth: 8, left: 5, resetsAt: "2026-10-31T18:30:00.000Z" },
    payNow: null,
    canPause: true,
    canResume: false,
    canCancel: true,
    autopay: null,
    autopayPays: null,
};

const PACK = {
    name: "5 classes",
    credits: 5,
    left: 3,
    expiresAt: "2026-12-01T00:00:00.000Z",
    live: true,
};

const TAB = {
    subscriptions: { ok: true, value: [SUB] },
    packs: { ok: true, value: [PACK] },
    pauseWeeks: [2, 4, 8],
    autopayMethods: [],
    autopayChecks: {},
};

describe("planTabResult", () => {
    it("accepts the API's tab", () => {
        expect(planTabResult(TAB)).toEqual(TAB);
    });

    it("a part in a strange shape reads as failed, never as none", () => {
        const odd = planTabResult({
            ...TAB,
            subscriptions: { ok: true, value: [{ ...SUB, canPause: "yes" }] },
            packs: { ok: true, value: [{ ...PACK, live: undefined }] },
        });
        expect(odd).toEqual({
            subscriptions: { ok: false },
            packs: { ok: false },
            pauseWeeks: [2, 4, 8],
            autopayMethods: [],
            autopayChecks: {},
        });
        expect(
            planTabResult({ ...TAB, subscriptions: { ok: false } })
                ?.subscriptions,
        ).toEqual({ ok: false });
    });

    it("reads autopay (D12): the provider's methods and each plan's state, anything strange as none", () => {
        const tab = planTabResult({
            ...TAB,
            autopayMethods: ["UPI", "NACH", "CARD"],
            subscriptions: {
                ok: true,
                value: [
                    {
                        ...SUB,
                        autopay: {
                            state: "ON",
                            method: "UPI",
                            hint: "mo•••@okicici",
                        },
                        autopayPays: { total: "2500.00", currency: "INR" },
                    },
                    { ...SUB, ref: "sub_2", autopay: { state: "MAYBE" } },
                ],
            },
        });
        expect(tab?.autopayMethods).toEqual(["UPI", "CARD"]);
        const subs = tab?.subscriptions;
        expect(subs?.ok && subs.value[0].autopay).toEqual({
            state: "ON",
            method: "UPI",
            hint: "mo•••@okicici",
            check: null,
        });
        expect(subs?.ok && subs.value[0].autopayPays).toEqual({
            total: "2500.00",
            currency: "INR",
        });
        expect(subs?.ok && subs.value[1].autopay).toBeNull();
        // An API from before D12 offers none.
        const { autopayMethods: _, ...older } = TAB;
        expect(planTabResult(older)?.autopayMethods).toEqual([]);
    });

    it("reads the ₹1 check (D12B): each method's before, each plan's after, anything strange as none", () => {
        const rupee = { amount: "1.00", currency: "INR" };
        const tab = planTabResult({
            ...TAB,
            autopayMethods: ["UPI", "CARD", "EMANDATE"],
            autopayChecks: { UPI: rupee, CARD: { amount: 1 } },
            subscriptions: {
                ok: true,
                value: [
                    {
                        ...SUB,
                        autopay: {
                            state: "ON",
                            method: "UPI",
                            hint: null,
                            check: {
                                ...rupee,
                                state: "REFUNDED",
                                refundedAt: "2026-10-02T06:00:00.000Z",
                            },
                        },
                    },
                    {
                        ...SUB,
                        ref: "sub_2",
                        autopay: {
                            state: "ON",
                            method: "UPI",
                            hint: null,
                            check: { ...rupee, state: "LOST" },
                        },
                    },
                ],
            },
        });
        expect(tab?.autopayChecks).toEqual({ UPI: rupee });
        const subs = tab?.subscriptions;
        expect(subs?.ok && subs.value[0].autopay?.check).toEqual({
            ...rupee,
            state: "REFUNDED",
            refundedAt: "2026-10-02T06:00:00.000Z",
        });
        expect(subs?.ok && subs.value[1].autopay?.check).toBeNull();
        // An API from before D12B names none.
        const { autopayChecks: _, ...older } = TAB;
        expect(planTabResult(older)?.autopayChecks).toEqual({});
    });

    it("refuses what isn't a tab at all", () => {
        expect(planTabResult(null)).toBeNull();
        expect(planTabResult({ ...TAB, pauseWeeks: "2,4,8" })).toBeNull();
        expect(planTabResult({ ...TAB, pauseWeeks: ["2"] })).toBeNull();
    });
});

describe("planChangeAnswer", () => {
    it("carries the message and the tab now", () => {
        expect(
            planChangeAnswer(200, { message: "Paused.", tab: TAB }, "x"),
        ).toEqual({ ok: true, message: "Paused.", tab: TAB });
    });

    it("passes on the member's own refusals, and words a 404 and the rest itself", () => {
        const refused = (status: number, message: string) =>
            planChangeAnswer(status, { error: { message } }, "fallback");
        expect(
            refused(
                403,
                "Pausing from your account is off. Ask the business to pause your plan.",
            ),
        ).toEqual({
            ok: false,
            message:
                "Pausing from your account is off. Ask the business to pause your plan.",
        });
        expect(refused(409, "This plan isn't paused.")).toEqual({
            ok: false,
            message: "This plan isn't paused.",
        });
        expect(refused(404, "Subscription not found")).toEqual({
            ok: false,
            message:
                "That plan isn't on your account any more. Refresh the page.",
        });
        expect(refused(500, "Internal server error")).toEqual({
            ok: false,
            message: "fallback",
        });
        // A 200 in a shape we don't know is not a success.
        expect(planChangeAnswer(200, { message: "ok" }, "fallback")).toEqual({
            ok: false,
            message: "fallback",
        });
    });
});

describe("payNowAnswer", () => {
    it("sends the member only to a pay page", () => {
        expect(
            payNowAnswer(200, { url: "https://saroh.app/pay/tok_1" }, "x"),
        ).toEqual({ ok: true, url: "https://saroh.app/pay/tok_1" });
        for (const url of [
            "https://evil.example/elsewhere",
            "javascript:alert(1)",
            "/pay/relative",
            42,
        ]) {
            expect(payNowAnswer(200, { url }, "fallback")).toEqual({
                ok: false,
                message: "fallback",
            });
        }
    });

    it("says an autopay charge in progress, as the API words it", () => {
        expect(
            payNowAnswer(
                409,
                { error: { message: "Autopay charge in progress" } },
                "fallback",
            ),
        ).toEqual({ ok: false, message: "Autopay charge in progress" });
    });
});
