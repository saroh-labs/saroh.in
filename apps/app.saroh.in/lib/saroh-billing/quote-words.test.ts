import { describe, expect, it } from "vitest";

import type { ChangeQuote } from "./plan-view";
import { quoteSummary } from "./quote-words";

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
                "12 monthly charges, then renew with one tap",
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
                "Renew with one tap before the year ends",
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
