/**
 * The plan-change rule (pricing catalogue U15): which kind of change, and
 * every amount, from the plan rows alone. Made-up prices (111, 222, 333
 * rupees in paise) — never a real plan.
 */
import { gstPaise, withGstPaise } from "@saroh/pricing-catalog";

import type { QuotePlanRow, QuoteSubscription } from "./checkout-quote";
import { prorateDifferencePaise, quoteChange } from "./checkout-quote";
import { moveReadiness } from "./plan-moves";

const row = (
    id: string,
    priceCents: number,
    interval = "month",
    key = `catalog.${id.split("@")[0]}`,
): QuotePlanRow => ({ id, key, version: 1, interval, priceCents });

const FREE = row("free@1", 0);
const B = row("b@1", 22_200);
const C = row("c@1", 33_300);
const B_YEAR = row("b-year@1", 222_000, "year", "catalog.b");

const NOW = new Date("2026-03-11T00:00:00Z");
// The period is 21 Feb → 21 Mar (28 days); on 11 Mar, 10 are left.
const END = new Date("2026-03-21T00:00:00Z");

function sub(over: Partial<QuoteSubscription> = {}): QuoteSubscription {
    return {
        status: "ACTIVE",
        provider: "RAZORPAY",
        providerSubscriptionId: "sub_1",
        currentPeriodEnd: END,
        pendingPlanId: null,
        pendingFrom: null,
        plan: B,
        ...over,
    };
}

describe("quoteChange", () => {
    it("is NONE for the plan it's on", () => {
        expect(
            quoteChange({ subscription: sub(), target: B, now: NOW }).kind,
        ).toBe("NONE");
    });

    it("prices the recurring charge with GST from the row, never anything else", () => {
        const q = quoteChange({ subscription: null, target: C, now: NOW });
        expect(q).toMatchObject({
            kind: "NEW",
            pricePaise: 33_300,
            gstPaise: gstPaise(33_300),
            totalPaise: 33_300 + gstPaise(33_300),
            chargeNowPaise: 0,
            startAt: null,
        });
    });

    it("from Free, a cancelled plan, or one not billed through the provider is NEW", () => {
        const fromFree = sub({
            plan: FREE,
            provider: null,
            providerSubscriptionId: null,
            currentPeriodEnd: null,
        });
        expect(
            quoteChange({ subscription: fromFree, target: B, now: NOW }).kind,
        ).toBe("NEW");
        expect(
            quoteChange({
                subscription: sub({ status: "CANCELLED" }),
                target: C,
                now: NOW,
            }).kind,
        ).toBe("NEW");
        expect(
            quoteChange({
                subscription: sub({
                    plan: row("legacy", 9_900, "month", "business"),
                }),
                target: C,
                now: NOW,
            }).kind,
        ).toBe("NEW");
    });

    it("a pricier plan mid-period is an UPGRADE: the difference for what's left, plan charges from the period's end", () => {
        const q = quoteChange({ subscription: sub(), target: C, now: NOW });
        // Feb 21 → Mar 21 is 28 days; 10 are left.
        const diff = Math.round(((33_300 - 22_200) * 10) / 28);
        expect(q).toMatchObject({
            kind: "UPGRADE",
            chargeNowPaise: diff,
            chargeNowGstPaise: gstPaise(diff),
            chargeNowTotalPaise: diff + gstPaise(diff),
            startAt: END,
            effectiveAt: null,
        });
    });

    it("a cheaper plan, or the other cycle, is SCHEDULED for the period's end", () => {
        const down = quoteChange({
            subscription: sub({ plan: C }),
            target: B,
            now: NOW,
        });
        expect(down).toMatchObject({
            kind: "SCHEDULED",
            startAt: END,
            effectiveAt: END,
            chargeNowPaise: 0,
        });
        expect(
            quoteChange({ subscription: sub(), target: B_YEAR, now: NOW }).kind,
        ).toBe("SCHEDULED");
    });

    it("the plan a move is taking it to is SCHEDULED for the move's date (authorise again, OQ-6)", () => {
        const from = new Date("2026-04-21T00:00:00Z");
        const target = { ...B, id: "b@2", version: 2, priceCents: 23_400 };
        const q = quoteChange({
            subscription: sub({ pendingPlanId: "b@2", pendingFrom: from }),
            target,
            now: NOW,
        });
        expect(q).toMatchObject({ kind: "SCHEDULED", startAt: from });
    });

    it("to a free plan: at the period's end when paid at the provider, else now", () => {
        expect(
            quoteChange({ subscription: sub(), target: FREE, now: NOW }),
        ).toMatchObject({ kind: "TO_FREE", effectiveAt: END });
        expect(
            quoteChange({
                subscription: sub({
                    provider: null,
                    providerSubscriptionId: null,
                }),
                target: FREE,
                now: NOW,
            }),
        ).toMatchObject({ kind: "TO_FREE", effectiveAt: NOW });
    });
});

describe("prorateDifferencePaise", () => {
    it("rounds half-up to the paisa and never charges for a downgrade or a spent period", () => {
        const start = new Date("2026-01-01T00:00:00Z");
        const end = new Date("2026-01-03T00:00:00Z");
        const mid = new Date("2026-01-02T00:00:00Z");
        expect(
            prorateDifferencePaise({
                fromPaise: 0,
                toPaise: 3,
                periodStart: start,
                periodEnd: end,
                now: mid,
            }),
        ).toBe(2); // 1.5 → 2
        expect(
            prorateDifferencePaise({
                fromPaise: 9,
                toPaise: 3,
                periodStart: start,
                periodEnd: end,
                now: mid,
            }),
        ).toBe(0);
        expect(
            prorateDifferencePaise({
                fromPaise: 0,
                toPaise: 300,
                periodStart: start,
                periodEnd: end,
                now: end,
            }),
        ).toBe(0);
        expect(
            prorateDifferencePaise({
                fromPaise: 0,
                toPaise: 300,
                periodStart: start,
                periodEnd: end,
                now: start,
            }),
        ).toBe(300);
    });
});

describe("moveReadiness", () => {
    const PAST = new Date("2026-03-01T00:00:00Z");
    const base = {
        status: "ACTIVE",
        provider: "RAZORPAY",
        providerSubscriptionId: "sub_1",
        cancelAtPeriodEnd: false,
        pendingPlanId: "b@2",
        pendingFrom: PAST,
        plan: B,
        pendingPlan: { ...B, id: "b@2", version: 2 },
    };
    const ready = (
        over: Partial<typeof base> = {},
        scheduledPlanId: string | null = null,
        held: number[] = [],
    ) =>
        moveReadiness({
            subscription: { ...base, ...over },
            scheduledPlanId,
            held: new Set(held),
            now: NOW,
        });

    it("waits for its date and for its version's provider plans", () => {
        expect(ready({ pendingFrom: new Date("2027-01-01T00:00:00Z") })).toBe(
            "not-due",
        );
        expect(ready({}, null, [2])).toBe("held");
        expect(ready({ pendingPlan: null, pendingPlanId: null })).toBe("none");
    });

    it("applies the same amount, anything not billed by the provider, and Free once the provider was told to stop", () => {
        expect(ready()).toBe("ready");
        expect(ready({ provider: null, providerSubscriptionId: null })).toBe(
            "ready",
        );
        expect(
            ready({
                cancelAtPeriodEnd: true,
                pendingPlan: { ...FREE, id: "free@2", version: 2 },
            }),
        ).toBe("ready");
    });

    it("never applies a new amount the business hasn't authorised (OQ-6)", () => {
        const pricier = { ...B, id: "b@2", version: 2, priceCents: 23_400 };
        expect(ready({ pendingPlan: pricier })).toBe("needs-authorisation");
        expect(ready({ pendingPlan: pricier }, "b@2")).toBe("ready");
        expect(
            ready({ pendingPlan: { ...FREE, id: "free@2", version: 2 } }),
        ).toBe("needs-authorisation");
    });
});

describe("offers in the quote (U16)", () => {
    const DAY = 24 * 60 * 60 * 1000;

    it("a paid plan with a trial the business may have is TRIAL: nothing now, the first charge at the trial's end", () => {
        const q = quoteChange({
            subscription: sub({ plan: FREE, provider: null }),
            target: B,
            now: NOW,
            trialDays: 7,
        });
        const ends = new Date(NOW.getTime() + 7 * DAY);
        expect(q).toMatchObject({
            kind: "TRIAL",
            startAt: ends,
            trialEndsAt: ends,
            effectiveAt: null,
            chargeNowPaise: 0,
            firstChargePaise: 22_200,
        });
        // No trial offered (or had already): NEW.
        expect(
            quoteChange({ subscription: null, target: B, now: NOW }).kind,
        ).toBe("NEW");
    });

    it("another paid plan while a trial runs stays a trial to the same end; Free ends it now", () => {
        const trialing = sub({ status: "TRIALING" });
        expect(
            quoteChange({ subscription: trialing, target: C, now: NOW }),
        ).toMatchObject({
            kind: "TRIAL",
            startAt: END,
            trialEndsAt: END,
            chargeNowPaise: 0,
        });
        expect(
            quoteChange({ subscription: trialing, target: FREE, now: NOW }),
        ).toMatchObject({ kind: "TO_FREE", effectiveAt: NOW });
    });

    it("a monthly coupon comes off each of its months; the provider is told the GST-inclusive difference", () => {
        const q = quoteChange({
            subscription: null,
            target: B,
            now: NOW,
            coupon: { discountPaise: 111, months: 3 },
        });
        expect(q).toMatchObject({
            kind: "NEW",
            discountPaise: 111,
            discountCharges: 3,
            firstChargePaise: 22_089,
            firstChargeGstPaise: gstPaise(22_089),
            firstChargeTotalPaise: 22_089 + gstPaise(22_089),
            discountTotalPaise:
                22_200 + gstPaise(22_200) - (22_089 + gstPaise(22_089)),
            // The recurring charge itself is unchanged.
            pricePaise: 22_200,
        });
    });

    it("a yearly coupon is its months' worth once, off the first yearly charge, never more than it", () => {
        expect(
            quoteChange({
                subscription: null,
                target: B_YEAR,
                now: NOW,
                coupon: { discountPaise: 111, months: 3 },
            }),
        ).toMatchObject({
            discountPaise: 333,
            discountCharges: 1,
            firstChargePaise: 222_000 - 333,
        });
        expect(
            quoteChange({
                subscription: null,
                target: B,
                now: NOW,
                coupon: { discountPaise: 99_999, months: 1 },
            }),
        ).toMatchObject({ discountPaise: 22_200, firstChargePaise: 0 });
    });

    it("a coupon never touches a change that doesn't start a plan", () => {
        expect(
            quoteChange({
                subscription: sub(),
                target: C,
                now: NOW,
                coupon: { discountPaise: 111, months: 3 },
            }),
        ).toMatchObject({
            kind: "UPGRADE",
            discountPaise: 0,
            discountCharges: 0,
            firstChargePaise: 33_300,
        });
    });
});

describe("how it's paid (DEC-093)", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const C_YEAR = row("c-year@1", 333_000, "year", "catalog.c");
    const fromFree = sub({
        plan: FREE,
        provider: null,
        providerSubscriptionId: null,
        currentPeriodEnd: null,
    });

    it("monthly is autopay for 12 charges; the first charge is the mandate's payment", () => {
        expect(
            quoteChange({ subscription: fromFree, target: B, now: NOW }),
        ).toMatchObject({
            kind: "NEW",
            payment: "AUTOPAY",
            termCharges: 12,
            payNowTotalPaise: 22_200 + gstPaise(22_200),
            mandateCheck: "PAID",
        });
    });

    it("a nominal first month is taken now, GST added, and is the mandate's payment", () => {
        const q = quoteChange({
            subscription: fromFree,
            target: B,
            now: NOW,
            trialDays: 30,
            trialFirstPaise: 700,
        });
        expect(q).toMatchObject({
            kind: "TRIAL",
            chargeNowPaise: 700,
            chargeNowGstPaise: gstPaise(700),
            chargeNowTotalPaise: 700 + gstPaise(700),
            payNowTotalPaise: 700 + gstPaise(700),
            mandateCheck: "PAID",
            trialEndsAt: new Date(NOW.getTime() + 30 * DAY),
        });
    });

    it("free first days owe nothing now: the provider's check is refunded", () => {
        expect(
            quoteChange({
                subscription: fromFree,
                target: B,
                now: NOW,
                trialDays: 30,
            }),
        ).toMatchObject({
            kind: "TRIAL",
            payNowTotalPaise: 0,
            mandateCheck: "REFUNDED",
        });
        // A scheduled change, authorised now, owes nothing now either.
        expect(
            quoteChange({
                subscription: sub({ plan: C }),
                target: B,
                now: NOW,
            }),
        ).toMatchObject({ kind: "SCHEDULED", mandateCheck: "REFUNDED" });
    });

    it("never charges more for the first month than a month", () => {
        expect(
            quoteChange({
                subscription: fromFree,
                target: B,
                now: NOW,
                trialDays: 30,
                trialFirstPaise: 99_999_999,
            }).chargeNowPaise,
        ).toBe(22_200);
    });

    it("yearly is one payment, never autopay, and never a trial", () => {
        const q = quoteChange({
            subscription: fromFree,
            target: B_YEAR,
            now: NOW,
            trialDays: 30,
            trialFirstPaise: 700,
            coupon: { discountPaise: 111, months: 1 },
        });
        expect(q).toMatchObject({
            kind: "NEW",
            payment: "ONE_TIME",
            termCharges: 1,
            mandateCheck: "NONE",
            payNowTotalPaise: withGstPaise(222_000 - 111),
        });
    });

    it("yearly from monthly is paid now for a year that starts at the period's end", () => {
        expect(
            quoteChange({ subscription: sub(), target: B_YEAR, now: NOW }),
        ).toMatchObject({
            kind: "SCHEDULED",
            startAt: END,
            payment: "ONE_TIME",
            payNowTotalPaise: withGstPaise(222_000),
        });
    });

    it("a pricier year mid-year pays the difference now, once", () => {
        const yearEnd = new Date(NOW.getTime() + 100 * DAY);
        const q = quoteChange({
            subscription: sub({ plan: B_YEAR, currentPeriodEnd: yearEnd }),
            target: C_YEAR,
            now: NOW,
        });
        expect(q.kind).toBe("UPGRADE");
        expect(q.payment).toBe("ONE_TIME");
        expect(q.payNowTotalPaise).toBe(q.chargeNowTotalPaise);
        expect(q.chargeNowPaise).toBeGreaterThan(0);
    });

    it("yearly while a trial runs starts the year now", () => {
        expect(
            quoteChange({
                subscription: sub({ status: "TRIALING" }),
                target: B_YEAR,
                now: NOW,
            }),
        ).toMatchObject({ kind: "NEW", payment: "ONE_TIME" });
    });

    it("the plan it's on is a renewal from its term's end, inside the last 30 days only", () => {
        const soon = new Date(NOW.getTime() + 10 * DAY);
        expect(
            quoteChange({
                subscription: sub(),
                target: B,
                now: NOW,
                termEndsAt: soon,
            }),
        ).toMatchObject({
            kind: "RENEW",
            startAt: soon,
            effectiveAt: soon,
            payment: "AUTOPAY",
            termCharges: 12,
            mandateCheck: "REFUNDED",
        });
        // At today's price: a later version's row of the same plan.
        expect(
            quoteChange({
                subscription: sub(),
                target: { ...B, id: "b@2", version: 2, priceCents: 23_300 },
                now: NOW,
                termEndsAt: soon,
            }),
        ).toMatchObject({ kind: "RENEW", pricePaise: 23_300 });
        const later = new Date(NOW.getTime() + 60 * DAY);
        expect(
            quoteChange({
                subscription: sub(),
                target: B,
                now: NOW,
                termEndsAt: later,
            }).kind,
        ).toBe("NONE");
        // A year paid once renews as one payment for the next year.
        expect(
            quoteChange({
                subscription: sub({ plan: B_YEAR }),
                target: B_YEAR,
                now: NOW,
                termEndsAt: soon,
            }),
        ).toMatchObject({
            kind: "RENEW",
            payment: "ONE_TIME",
            payNowTotalPaise: withGstPaise(222_000),
        });
    });
});
