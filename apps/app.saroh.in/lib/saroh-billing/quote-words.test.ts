import { describe, expect, it } from "vitest";

import type { ChangeQuote } from "./plan-view";
import { endingAddonsNote, quoteSummary } from "./quote-words";

/** Made up on purpose: Plan C at ₹222, a first month of ₹7 — no real prices. */
const quote = (over: Partial<ChangeQuote> = {}): ChangeQuote => ({
    plan: { id: "c", name: "Plan C", version: 3 },
    cycle: "month",
    kind: "NEW",
    pricePaise: 22_200,
    gstPaise: 3_996,
    totalPaise: 26_196,
    chargeNowPaise: 0,
    chargeNowGstPaise: 0,
    chargeNowTotalPaise: 0,
    startAt: null,
    effectiveAt: null,
    trialEndsAt: null,
    coupon: null,
    firstChargePaise: 22_200,
    firstChargeGstPaise: 3_996,
    firstChargeTotalPaise: 26_196,
    payment: "AUTOPAY",
    termCharges: 12,
    payNowTotalPaise: 26_196,
    mandateCheck: "PAID",
    ...over,
});

const values = (q: ChangeQuote, current = "Plan A") =>
    quoteSummary(q, { currentPlan: current }).lines.map((l) => l.value);

describe("quoteSummary (DEC-093)", () => {
    it("shows every amount the API sent, never one of its own", () => {
        const s = quoteSummary(quote(), { currentPlan: "Plan A" });
        expect(s.title).toBe("Start Plan C");
        expect(s.lines[0]).toEqual({
            label: "Plan C, monthly",
            value: "₹222 + ₹39.96 GST = ₹261.96 a month",
        });
        expect(s).toMatchObject({
            confirm: "Continue to payment",
            toPayment: true,
        });
    });

    it("monthly: today's payment is the first month and isn't refunded; 12 charges, then one tap", () => {
        const s = quoteSummary(quote(), { currentPlan: "Plan A" });
        expect(s.lead).toMatch(/isn't refunded/);
        expect(s.lead).toMatch(/you stay on Plan A\.$/);
        expect(values(quote())).toEqual(
            expect.arrayContaining([
                "₹261.96 (incl. GST)",
                "12 monthly charges, then we ask you to pay for the next 12",
            ]),
        );
    });

    it("a nominal first month: named, its amount, kept, and when the plan's own charges start", () => {
        const q = quote({
            kind: "TRIAL",
            chargeNowPaise: 700,
            chargeNowGstPaise: 126,
            chargeNowTotalPaise: 826,
            payNowTotalPaise: 826,
            trialEndsAt: "2026-11-06T00:00:00.000Z",
        });
        const s = quoteSummary(q, { currentPlan: "Plan A" });
        expect(s.title).toBe("Start Plan C with your first month");
        expect(s.lead).toContain("₹8.26 (incl. GST)");
        expect(s.lead).toContain("isn't refunded");
        expect(s.lead).not.toMatch(/nothing is (owed|charged) today/i);
        expect(s.lines[1]).toMatchObject({
            label: "Then from",
            iso: "2026-11-06T00:00:00.000Z",
        });
    });

    it("free first days: nothing owed, and the autopay check named as refunded", () => {
        const s = quoteSummary(
            quote({
                kind: "TRIAL",
                payNowTotalPaise: 0,
                mandateCheck: "REFUNDED",
                trialEndsAt: "2026-10-18T00:00:00.000Z",
            }),
            { currentPlan: "Plan A" },
        );
        expect(s.title).toBe("Start your Plan C trial");
        expect(s.lead).toMatch(/Razorpay takes a small amount and refunds it/);
    });

    it("words the failure from the plan it's on, never 'back on Free'", () => {
        const s = quoteSummary(quote({ kind: "TRIAL", chargeNowPaise: 700 }), {
            currentPlan: "Plan B",
        });
        expect(s.lead).toContain("you stay on Plan B");
        expect(s.lead).not.toContain("back on Free");
    });

    it("yearly: one payment for 12 months, no autopay", () => {
        const q = quote({
            cycle: "year",
            payment: "ONE_TIME",
            termCharges: 1,
            mandateCheck: "NONE",
            payNowTotalPaise: 261_960,
        });
        const s = quoteSummary(q, { currentPlan: "Plan A" });
        expect(s.lead).toMatch(/^One payment for 12 months, no autopay/);
        expect(values(q)).toEqual(
            expect.arrayContaining([
                "₹2,619.60 (incl. GST)",
                "Before the year ends, we ask you to pay for the next one",
            ]),
        );
    });

    it("says an upgrade's charge today and when the plan's own start", () => {
        const s = quoteSummary(
            quote({
                kind: "UPGRADE",
                chargeNowPaise: 5_550,
                chargeNowGstPaise: 999,
                chargeNowTotalPaise: 6_549,
                payNowTotalPaise: 6_549,
                startAt: "2026-11-01T00:00:00.000Z",
            }),
        );
        expect(s.lines[0].value).toBe("₹55.50 + ₹9.99 GST = ₹65.49");
        expect(s.lines[2]).toMatchObject({
            label: "Then from",
            iso: "2026-11-01T00:00:00.000Z",
        });
    });

    it("a renewal starts the day the term ends, at today's price", () => {
        const s = quoteSummary(
            quote({
                kind: "RENEW",
                startAt: "2027-10-01T00:00:00.000Z",
                payNowTotalPaise: 0,
                mandateCheck: "REFUNDED",
            }),
        );
        expect(s.title).toBe("Renew Plan C");
        expect(s.lead).toMatch(/at today's price/);
        expect(s.lines[0]).toMatchObject({
            label: "From",
            iso: "2027-10-01T00:00:00.000Z",
        });
    });

    it("says a coupon's discount and the first charge after it", () => {
        const q = quote({
            coupon: { code: "HELLO", discountPaise: 2_200, charges: 2 },
            firstChargePaise: 20_000,
            firstChargeGstPaise: 3_600,
            firstChargeTotalPaise: 23_600,
        });
        expect(values(q)).toContain("₹22 off each of the first 2 months");
        expect(values(q)).toContain("₹200 + ₹36 GST = ₹236");
    });

    it("needs no payment to move to free, and nothing for no change", () => {
        expect(
            quoteSummary(
                quote({
                    kind: "TO_FREE",
                    plan: { id: "a", name: "Plan A", version: 3 },
                }),
            ),
        ).toMatchObject({ confirm: "Move to Plan A", toPayment: false });
        expect(quoteSummary(quote({ kind: "NONE" })).confirm).toBeNull();
    });
});

describe("quoteSummary: when a change starts (DEC-159)", () => {
    const NOW = new Date("2026-10-13T00:00:00.000Z");
    const END = "2026-11-06T00:00:00.000Z";
    const at = (q: ChangeQuote, currentPlan = "Plan B") =>
        quoteSummary(q, { currentPlan, now: NOW });

    it("a dearer plan chosen during the first month starts today at its full price, and says the month ends", () => {
        const s = at(quote({ kind: "NEW", firstMonth: "NOW" }));
        expect(s.title).toBe("Upgrade to Plan C");
        expect(s.from).toBeNull();
        expect(s.lines[0]).toEqual({
            label: "Starts today",
            value: "₹261.96 now (incl. GST)",
        });
        expect(s.lead).toBe(
            "Plan C starts today at its full price, so your first month on Plan B ends now. What you paid for it isn't refunded. You pay Plan C's first month today as you set up UPI Autopay or a card for it. If it doesn't go through, you stay on Plan B.",
        );
        // The plan's own price and term, never a first-month amount.
        expect(s.lines.map((l) => l.label)).toEqual([
            "Starts today",
            "Plan C, monthly",
            "Term",
        ]);
        expect(s).toMatchObject({
            confirm: "Continue to payment",
            toPayment: true,
        });
    });

    it("the same on yearly: one payment today, the month ends", () => {
        const s = at(
            quote({
                kind: "NEW",
                firstMonth: "NOW",
                cycle: "year",
                payment: "ONE_TIME",
                termCharges: 1,
                mandateCheck: "NONE",
                payNowTotalPaise: 261_960,
            }),
        );
        expect(s.lines[0]).toEqual({
            label: "Starts today",
            value: "₹2,619.60 now (incl. GST)",
        });
        expect(s.lead).toContain("your first month on Plan B ends now");
        expect(s.lead).toContain("One payment for 12 months, no autopay.");
    });

    it("a plan started from Free keeps its own words", () => {
        const s = at(quote({ firstMonth: null }), "Plan A");
        expect(s.title).toBe("Start Plan C");
        expect(s.lines.map((l) => l.label)).not.toContain("Starts today");
    });

    it("a cheaper plan says the date and the plan kept until then", () => {
        const s = at(
            quote({
                kind: "SCHEDULED",
                plan: { id: "b", name: "Plan B", version: 3 },
                startAt: END,
                effectiveAt: END,
                payNowTotalPaise: 0,
                mandateCheck: "REFUNDED",
            }),
            "Plan C",
        );
        expect(s.title).toBe("Move to Plan B");
        expect(s.from).toEqual({ iso: END, keep: "Plan C" });
        expect(s.lead).toMatch(/^Nothing is owed today\./);
        expect(s.lead).toMatch(/Nothing changes until it starts\.$/);
        expect(s.lines[0]).toMatchObject({ label: "Starts", iso: END });
    });

    it("during the first month it says the month runs out first, with nothing more charged", () => {
        const s = at(
            quote({
                kind: "SCHEDULED",
                firstMonth: "AT_END",
                plan: { id: "b", name: "Plan B", version: 3 },
                startAt: END,
                effectiveAt: END,
                payNowTotalPaise: 0,
                mandateCheck: "REFUNDED",
            }),
            "Plan C",
        );
        expect(s.from).toEqual({ iso: END, keep: "Plan C" });
        expect(s.lead).toMatch(
            /^Your first month runs to its end first, and nothing more is charged for Plan C\. /,
        );
    });

    it("Free waits for what was paid, and says nothing more is charged", () => {
        const free = (over: Partial<ChangeQuote>) =>
            at(
                quote({
                    kind: "TO_FREE",
                    plan: { id: "a", name: "Plan A", version: 3 },
                    payNowTotalPaise: 0,
                    mandateCheck: "NONE",
                    ...over,
                }),
            );
        const paid = free({ effectiveAt: END });
        expect(paid.from).toEqual({ iso: END, keep: "Plan B" });
        expect(paid.lead).toBe(
            "Nothing more is charged. After that, anything over Free's limits stays readable, but you can't add more.",
        );
        const first = free({ effectiveAt: END, firstMonth: "AT_END" });
        expect(first.from).toEqual({ iso: END, keep: "Plan B" });
        expect(first.lead).toMatch(
            /^Your first month runs to its end and nothing more is charged\./,
        );
        // Nothing paid ahead: today, and no "until then".
        const today = free({ effectiveAt: NOW.toISOString() });
        expect(today.from).toBeNull();
        expect(today.lead).toMatch(/^From today, /);
    });

    it("an upgrade in a paid period and a renewal say no date to wait for", () => {
        expect(at(quote({ kind: "UPGRADE", startAt: END })).from).toBeNull();
        expect(at(quote({ kind: "RENEW", startAt: END })).from).toBeNull();
    });
});

describe("endingAddonsNote (DEC-157)", () => {
    const person = {
        id: "person-b",
        name: "One more person",
        quantity: 2,
        onNewPlan: "One more person on C",
    };

    it("names one add-on that ends, how many are held, and the new plan's own", () => {
        expect(
            endingAddonsNote(quote({ addonsEnding: [person] }), {
                currentPlan: "Plan B",
            }),
        ).toBe(
            "This add-on ends with Plan B: One more person × 2. After the change you can add One more person on C on Plan C, from Add-ons on this page. Nothing is added for you.",
        );
    });

    it("lists several, and says nothing of the new plan when it has none of the kind", () => {
        expect(
            endingAddonsNote(
                quote({
                    addonsEnding: [
                        { ...person, onNewPlan: null },
                        {
                            id: "bills",
                            name: "Bills on their own",
                            quantity: 1,
                            onNewPlan: null,
                        },
                    ],
                }),
                { currentPlan: "Plan B" },
            ),
        ).toBe(
            "These add-ons end with Plan B: One more person × 2, Bills on their own.",
        );
    });

    it("names a new plan's add-on once, however many it stands in for", () => {
        const note = endingAddonsNote(
            quote({
                addonsEnding: [
                    person,
                    { ...person, id: "person-old", name: "A person" },
                ],
            }),
        );
        expect(note).toContain("end with your current plan:");
        expect(note?.match(/One more person on C/g)).toHaveLength(1);
    });

    it("is nothing when none ends, or the API sent none", () => {
        expect(endingAddonsNote(quote({ addonsEnding: [] }))).toBeNull();
        expect(endingAddonsNote(quote())).toBeNull();
    });
});
