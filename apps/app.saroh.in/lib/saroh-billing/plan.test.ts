import { describe, expect, it } from "vitest";

import type { SarohPlan, SarohSubscription } from "./plan";
import {
    planIncludes,
    planOptions,
    planPrice,
    planSummary,
    usageLine,
} from "./plan";

const plan = (over: Partial<SarohPlan> = {}): SarohPlan => ({
    id: "plan_business",
    key: "business",
    version: 1,
    name: "Business",
    priceCents: 149900,
    currency: "INR",
    interval: "month",
    entitlements: { sites: 5, teamMembers: 10, customDomain: true },
    active: true,
    ...over,
});

const FREE = plan({
    id: "plan_free",
    key: "free",
    name: "Free",
    priceCents: 0,
    entitlements: { sites: 1, teamMembers: 2, customDomain: false },
});

const sub = (over: Partial<SarohSubscription> = {}): SarohSubscription => ({
    id: "sub_1",
    status: "ACTIVE",
    provider: "RAZORPAY",
    currentPeriodEnd: "2026-10-04T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    plan: plan(),
    ...over,
});

describe("planPrice", () => {
    it("says the catalogue's price in words", () => {
        expect(planPrice(plan())).toBe("₹1,499 a month");
        expect(planPrice(plan({ interval: "year" }))).toBe("₹1,499 a year");
        expect(planPrice(FREE)).toBe("Free");
    });
});

describe("planIncludes", () => {
    it("reads the limits the API enforces", () => {
        expect(planIncludes(plan().entitlements)).toBe(
            "Website, bookings and selling · up to 10 people · your own domain",
        );
        expect(planIncludes({ teamMembers: 1 })).toBe(
            "Website, bookings and selling · just you",
        );
        expect(planIncludes({})).toBe(
            "Website, bookings and selling · as many people as you need",
        );
    });

    it("never counts websites: a business has one for now (ADR-006)", () => {
        expect(planIncludes({ sites: 5 })).not.toMatch(/5|websites/);
    });
});

describe("planSummary", () => {
    it("says plainly that a business with no plan is charged nothing", () => {
        const s = planSummary(null, "Rye & Co");
        expect(s.name).toBe("Early access");
        expect(s.price).toBeNull();
        expect(s.includes).toContain("Rye & Co");
        expect(s.next).toEqual({ kind: "text", text: "Nothing to pay" });
        expect(s.method).toBeNull();
        // No invented figures anywhere on the card.
        expect(JSON.stringify(s)).not.toMatch(/₹|\d/);
    });

    it("gives the next charge from the subscription", () => {
        const s = planSummary(sub(), "Rye & Co");
        expect(s.name).toBe("Business");
        expect(s.price).toBe("₹1,499 a month");
        expect(s.next).toEqual({
            kind: "charge",
            iso: "2026-10-04T00:00:00.000Z",
            amount: "₹1,499",
        });
        expect(s.method).toBe("Through Razorpay");
        expect(s.warning).toBeNull();
    });

    it("says the usage line isn't ready rather than inventing one", () => {
        expect(planSummary(sub(), "Rye & Co").footnote).toBe(
            "A monthly summary of what Saroh did for Rye & Co isn't ready yet.",
        );
        expect(
            planSummary(sub(), "Rye & Co", {
                receipts: 214,
                invoices: 1,
                paymentsCents: 18240000,
                currency: "INR",
            }).footnote,
        ).toBe(
            "Last month Saroh sent 214 receipts and 1 invoice for Rye & Co, and took ₹182,400 in payments.",
        );
    });

    it("names each state that needs the owner's eye in words", () => {
        expect(planSummary(sub({ status: "PAST_DUE" }), "X").next).toEqual({
            kind: "text",
            text: "Payment overdue",
        });
        expect(planSummary(sub({ status: "PAST_DUE" }), "X").warning).toMatch(
            /didn't go through/,
        );
        expect(planSummary(sub({ status: "CANCELLED" }), "X").warning).toMatch(
            /ended/,
        );
        expect(planSummary(sub({ cancelAtPeriodEnd: true }), "X").next).toEqual(
            { kind: "ends", iso: "2026-10-04T00:00:00.000Z" },
        );
        expect(
            planSummary(sub({ plan: FREE, provider: null }), "X").next,
        ).toEqual({ kind: "text", text: "Nothing to pay" });
        expect(planSummary(sub({ currentPeriodEnd: null }), "X").next).toEqual({
            kind: "text",
            text: "Date not set yet",
        });
    });
});

describe("planOptions", () => {
    const SCALE = plan({
        id: "p3",
        key: "scale",
        name: "Scale",
        priceCents: 399900,
    });

    it("marks the current plan and prices the others as up or across", () => {
        const options = planOptions([SCALE, plan(), FREE], sub());
        expect(options.map((o) => [o.key, o.current, o.cta])).toEqual([
            ["free", false, "Switch"],
            ["business", true, null],
            ["scale", false, "Upgrade"],
        ]);
    });

    it("offers every plan to choose when there is none", () => {
        expect(planOptions([plan(), FREE], null).map((o) => o.cta)).toEqual([
            "Choose",
            "Choose",
        ]);
        // A plan that has ended is not the current one.
        expect(
            planOptions([plan()], sub({ status: "CANCELLED" }))[0]?.current,
        ).toBe(false);
    });
});

describe("usageLine", () => {
    it("counts in words", () => {
        expect(
            usageLine(
                { receipts: 1, invoices: 0, paymentsCents: 0, currency: "INR" },
                "X",
            ),
        ).toBe(
            "Last month Saroh sent 1 receipt and 0 invoices for X, and took ₹0 in payments.",
        );
    });
});
