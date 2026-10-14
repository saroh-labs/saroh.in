import { describe, expect, it } from "vitest";

import { billingRules, nextParts, planMessage } from "./plan-status";
import type { PlanNote, PlanNoteKind } from "./plan-view";

/** Made-up amounts and dates: no real price. */
const END = "2026-11-01T00:00:00.000Z";

const note = (kind: PlanNoteKind, over: Partial<PlanNote> = {}): PlanNote => ({
    kind,
    tone: "info",
    lead: `${kind}.`,
    iso: null,
    tail: "",
    action: null,
    ...over,
});

describe('nextParts: what follows "You\'re on ‹plan›"', () => {
    it("says the first month and what follows it", () => {
        expect(
            nextParts(
                { kind: "charge", iso: END, amount: "₹111 + GST" },
                { firstMonth: true, price: "₹111 a month + GST" },
            ),
        ).toEqual([
            { lead: "First month until ", iso: END },
            { lead: "then ₹111 + GST a month" },
        ]);
    });

    it("says the next charge, its amount and its date", () => {
        expect(
            nextParts(
                { kind: "charge", iso: END, amount: "₹111 + GST + add-ons" },
                { price: "₹111 a month + GST" },
            ),
        ).toEqual([{ lead: "Next charge ₹111 + GST + add-ons on ", iso: END }]);
    });

    it('says "Nothing to pay" on a plan that costs nothing', () => {
        expect(
            nextParts(
                { kind: "text", text: "Nothing to pay" },
                { price: "₹0" },
            ),
        ).toEqual([{ lead: "Nothing to pay" }]);
        expect(
            nextParts(
                { kind: "text", text: "Nothing to pay" },
                { price: null },
            ),
        ).toEqual([{ lead: "Nothing to pay" }]);
    });

    it("keeps the price on a line that names no amount", () => {
        const price = "₹1,110 a year + GST";
        expect(nextParts({ kind: "paidTo", iso: END }, { price })).toEqual([
            { lead: price },
            { lead: "Paid to ", iso: END },
        ]);
        expect(nextParts({ kind: "ends", iso: END }, { price })).toEqual([
            { lead: price },
            { lead: "Ends ", iso: END },
        ]);
        expect(
            nextParts({ kind: "text", text: "Payment overdue" }, { price }),
        ).toEqual([{ lead: price }, { lead: "Payment overdue" }]);
    });
});

describe("planMessage: one message at a time", () => {
    it("says nothing when nothing needs the business", () => {
        const facts = [note("firstMonth"), note("term"), note("given")];
        expect(planMessage({ notes: facts })).toEqual({
            message: null,
            rest: facts,
        });
        expect(planMessage({ notes: [] })).toEqual({ message: null, rest: [] });
    });

    it("puts a failed payment before a plan change, and a plan change before any other warning", () => {
        const overdue = note("overdue", { tone: "attention" });
        const move = note("move");
        const renew = note("renew", { tone: "attention" });
        const term = note("term");

        const all = planMessage({ notes: [term, renew, move, overdue] });
        expect(all.message).toBe(overdue);
        // The rest is kept, in the order it was written.
        expect(all.rest).toEqual([term, renew, move]);

        expect(planMessage({ notes: [term, renew, move] }).message).toBe(move);
        expect(planMessage({ notes: [term, renew] }).message).toBe(renew);
    });

    it("ranks a change that waits on the business before one that is only on its way", () => {
        const authorise = note("authorise", { tone: "attention" });
        const scheduled = note("scheduled");
        const renewed = note("renewed");
        expect(
            planMessage({ notes: [renewed, scheduled, authorise] }).message,
        ).toBe(authorise);
        expect(planMessage({ notes: [renewed, scheduled] }).message).toBe(
            scheduled,
        );
        expect(planMessage({ notes: [renewed] }).message).toBe(renewed);
    });

    it("says a payment under way before every note, and drops none", () => {
        const overdue = note("overdue", { tone: "attention" });
        const term = note("term");
        expect(planMessage({ notes: [overdue, term], pending: true })).toEqual({
            message: "pending",
            rest: [overdue, term],
        });
    });

    it("takes a legacy plan's one warning as the message", () => {
        const { message, rest } = planMessage({
            notes: [],
            warning: "This plan has ended.",
        });
        expect(message).toMatchObject({
            kind: "warning",
            tone: "attention",
            lead: "This plan has ended.",
        });
        expect(rest).toEqual([]);
    });
});

describe("billingRules", () => {
    it("says nothing of yearly when the catalogue has no yearly billing", () => {
        expect(billingRules(false)).toEqual([
            "Plans are paid monthly by autopay. Each autopay you approve covers 12 monthly charges; before it runs out, we ask you to approve the next one.",
            "Prices can change. We tell you at least 30 days ahead and ask you to approve the new amount; until you do, you keep paying the price you have.",
            "Upgrades start today. A cheaper plan or Free starts when what you've paid for ends.",
        ]);
        expect(billingRules(false).join(" ")).not.toMatch(/yearly/i);
        expect(billingRules(true)[0]).toContain(
            "Yearly is one payment for the year",
        );
    });

    it("says how many charges an autopay covers, and never promises a price (DEC-161)", () => {
        expect(billingRules(false, 60)[0]).toContain(
            "covers 60 monthly charges",
        );
        for (const yearly of [false, true]) {
            const said = billingRules(yearly).join(" ");
            expect(said).not.toMatch(
                /\bterm\b|12-month|price doesn't change|pay for the next/i,
            );
            expect(said).toContain("at least 30 days ahead");
        }
    });
});

describe("a new price to approve (DEC-161)", () => {
    it("is the page's one message over the autopay's renewal", () => {
        const price = note("priceChange", { tone: "attention" });
        const { message } = planMessage({
            notes: [note("renew", { tone: "attention" }), price, note("term")],
        });
        expect(message).toBe(price);
    });

    it("waits behind a failed payment and a due approval", () => {
        const { message } = planMessage({
            notes: [note("priceChange"), note("authorise")],
        });
        expect((message as PlanNote).kind).toBe("authorise");
    });
});
