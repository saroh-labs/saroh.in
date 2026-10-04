import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { access } from "@/lib/billing/fixtures.test-data";

import type { SarohSubscription } from "./plan";
import type { AddonsView, ChangeQuote } from "./plan-view";
import {
    addonRows,
    pickerRows,
    quoteSummary,
    yearlyOffer,
    yourPlan,
} from "./plan-view";

/** Made up on purpose: Plan A/B/C, ₹0 / ₹111 / ₹222 — no real prices. */
const CATALOG: Catalog = parseCatalog({
    plans: [
        { id: "a", name: "Plan A", pricePaise: 0, tagline: "For A.", cta: "A" },
        {
            id: "b",
            name: "Plan B",
            pricePaise: 11_100,
            tagline: "For B.",
            cta: "B",
        },
        {
            id: "c",
            name: "Plan C",
            pricePaise: 22_200,
            tagline: "For C.",
            cta: "C",
            trial: { on: true, days: 14 },
        },
    ],
    groups: [{ id: "g", name: "G" }],
    modules: [
        {
            id: "products",
            name: "Things",
            group: "g",
            what: "Things.",
            cells: {
                a: { inc: true, text: "10", card: "10", limit: 10 },
                b: { inc: true, text: "100", card: "100", limit: 100 },
                c: { inc: true, text: "1,000", card: "1,000", limit: 1000 },
            },
        },
    ],
    yearly: { on: true, paid: 10 },
    gst: { show: "excl" },
    addons: [],
});

const sub = (over: Partial<SarohSubscription> = {}): SarohSubscription => ({
    id: "sub",
    status: "ACTIVE",
    provider: "RAZORPAY",
    currentPeriodEnd: "2026-11-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    billingCycle: "month",
    plan: {
        id: "p",
        key: "catalog.b",
        version: 3,
        name: "Plan B",
        priceCents: 11_100,
        currency: "INR",
        interval: "month",
        entitlements: {},
        active: true,
    },
    ...over,
});

describe("yourPlan", () => {
    it("draws the plan, its price before GST and the next charge", () => {
        const v = yourPlan({
            access: access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
            }),
            subscription: sub(),
            catalog: CATALOG,
            liveVersion: 3,
            checkouts: null,
            addonsHeld: false,
        });
        expect(v).toMatchObject({
            name: "Plan B",
            price: "₹111 a month + GST",
            includes: "For B.",
            next: {
                kind: "charge",
                iso: "2026-11-01T00:00:00.000Z",
                amount: "₹111 + GST",
            },
            method: "Through Razorpay",
            notes: [],
        });
    });

    it("says an older version, add-ons on the charge, and a yearly row's price", () => {
        const v = yourPlan({
            access: access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
                version: 2,
            }),
            subscription: sub({
                billingCycle: "year",
                plan: { ...sub().plan, interval: "year", priceCents: 111_000 },
            }),
            catalog: CATALOG,
            liveVersion: 3,
            checkouts: null,
            addonsHeld: true,
        });
        expect(v.price).toBe("₹1,110 a year + GST");
        expect(v.includes).toBe(
            "For B. · You're on the pricing from version 2.",
        );
        expect(v.next).toMatchObject({ amount: "₹1,110 + GST + add-ons" });
    });

    it("says a plan given for a while is free until its date", () => {
        const v = yourPlan({
            access: access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
                planOverride: {
                    planKey: "b",
                    expiresAt: "2027-01-03T00:00:00.000Z",
                },
            }),
            subscription: sub({
                provider: null,
                plan: { ...sub().plan, key: "catalog.a", priceCents: 0 },
            }),
            catalog: CATALOG,
            liveVersion: 3,
            checkouts: null,
            addonsHeld: false,
        });
        expect(v.price).toBeNull();
        expect(v.freeUntil).toBe("2027-01-03T00:00:00.000Z");
        expect(v.next).toEqual({ kind: "text", text: "Nothing to pay" });
        expect(v.notes[0]).toMatchObject({
            lead: "Plan B is yours, free, until ",
            tail: ". Then you're on Plan A unless you choose a plan below.",
        });
    });

    it("says a move on a date, one waiting to be authorised, and an open checkout", () => {
        const base = {
            subscription: sub(),
            catalog: CATALOG,
            liveVersion: 3,
            addonsHeld: false,
        };
        const moving = yourPlan({
            ...base,
            access: access({
                plan: { id: "b", name: "Plan B" },
                pendingMove: {
                    planId: "a",
                    version: 3,
                    from: "2026-11-01T00:00:00.000Z",
                    waiting: null,
                },
            }),
            checkouts: null,
        });
        expect(moving.notes[0]).toMatchObject({
            lead: "Your plan changes to Plan A on ",
            action: null,
        });

        const authorise = yourPlan({
            ...base,
            access: access({
                plan: { id: "b", name: "Plan B" },
                pendingMove: {
                    planId: "c",
                    version: 4,
                    from: "2026-11-01T00:00:00.000Z",
                    waiting: "authorise",
                },
            }),
            checkouts: {
                open: {
                    id: "co",
                    kind: "UPGRADE",
                    status: "OPEN",
                    plan: { id: "c", name: "Plan C", version: 4 },
                    cycle: "month",
                    pricePaise: 22_200,
                    startAt: null,
                    expiresAt: "2026-10-05T00:00:00.000Z",
                    createdAt: "2026-10-04T00:00:00.000Z",
                },
                scheduled: null,
            },
        });
        expect(authorise.notes.map((n) => n.action?.label)).toEqual([
            "Authorise",
            "Start again",
        ]);
        expect(authorise.notes.every((n) => n.tone === "attention")).toBe(true);
    });

    it("says an overdue payment without inventing a date", () => {
        const v = yourPlan({
            access: access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
            }),
            subscription: sub({ status: "PAST_DUE" }),
            catalog: CATALOG,
            liveVersion: 3,
            checkouts: null,
            addonsHeld: false,
        });
        expect(v.next).toEqual({ kind: "text", text: "Payment overdue" });
        expect(v.notes[0]?.tone).toBe("attention");
    });
});

describe("pickerRows", () => {
    it("marks the billed plan, and offers each other as an upgrade or a switch", () => {
        const rows = pickerRows({
            catalog: CATALOG,
            subscription: sub(),
            cycle: "month",
            trials: new Set(),
        });
        expect(rows.map((r) => [r.name, r.price, r.current, r.cta])).toEqual([
            ["Plan A", "₹0", false, "Switch"],
            ["Plan B", "₹111 a month", true, null],
            ["Plan C", "₹222 a month", false, "Upgrade"],
        ]);
    });

    it("offers a trial only where the API quoted one", () => {
        const trial = pickerRows({
            catalog: CATALOG,
            subscription: sub(),
            cycle: "month",
            trials: new Set(["c"]),
        });
        expect(trial[2]).toMatchObject({
            cta: "Start 14-day trial",
            what: "For C. · 14-day free trial",
        });
    });

    it("prices yearly by the catalogue's rule, and offers billing the plan yearly", () => {
        const rows = pickerRows({
            catalog: CATALOG,
            subscription: sub(),
            cycle: "year",
            trials: new Set(),
        });
        expect(rows.map((r) => [r.price, r.current, r.cta])).toEqual([
            ["₹0", false, "Switch"],
            ["₹1,110 a year", false, "Bill yearly"],
            ["₹2,220 a year", false, "Upgrade"],
        ]);
        expect(yearlyOffer(CATALOG)).toEqual({ on: true, freeMonths: 2 });
        expect(
            yearlyOffer({ ...CATALOG, yearly: { on: false, paid: 10 } }),
        ).toEqual({ on: false });
    });

    it("reads a business with no subscription as on the free plan", () => {
        const rows = pickerRows({
            catalog: CATALOG,
            subscription: null,
            cycle: "month",
            trials: new Set(["c"]),
        });
        expect(rows.map((r) => r.cta)).toEqual([
            null,
            "Upgrade",
            "Start 14-day trial",
        ]);
    });
});

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
    ...over,
});

describe("quoteSummary", () => {
    it("shows every amount the API sent, never one of its own", () => {
        const s = quoteSummary(quote());
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

    it("says an upgrade's charge today and when the plan's own start", () => {
        const s = quoteSummary(
            quote({
                kind: "UPGRADE",
                chargeNowPaise: 5_550,
                chargeNowGstPaise: 999,
                chargeNowTotalPaise: 6_549,
                startAt: "2026-11-01T00:00:00.000Z",
            }),
        );
        expect(s.lines[0].value).toBe("₹55.50 + ₹9.99 GST = ₹65.49");
        expect(s.lines[2]).toMatchObject({
            label: "Then from",
            iso: "2026-11-01T00:00:00.000Z",
        });
    });

    it("says a coupon's discount and the first charge after it", () => {
        const s = quoteSummary(
            quote({
                coupon: { code: "HELLO", discountPaise: 2_200, charges: 2 },
                firstChargePaise: 20_000,
                firstChargeGstPaise: 3_600,
                firstChargeTotalPaise: 23_600,
            }),
        );
        expect(s.lines.map((l) => l.value)).toContain(
            "₹22 off each of the first 2 months",
        );
        expect(s.lines.map((l) => l.value)).toContain("₹200 + ₹36 GST = ₹236");
    });

    it("needs no payment page to move to free, and nothing for no change", () => {
        expect(
            quoteSummary(
                quote({
                    kind: "TO_FREE",
                    plan: { id: "a", name: "Plan A", version: 3 },
                }),
            ),
        ).toMatchObject({
            confirm: "Move to Plan A",
            toPayment: false,
        });
        expect(quoteSummary(quote({ kind: "NONE" })).confirm).toBeNull();
        expect(
            quoteSummary(
                quote({
                    kind: "TRIAL",
                    trialEndsAt: "2026-10-18T00:00:00.000Z",
                }),
            ).title,
        ).toBe("Start your Plan C trial");
    });
});

describe("addonRows", () => {
    const view = (
        over: Partial<AddonsView["addons"][number]> = {},
    ): AddonsView => ({
        canBuy: true,
        why: null,
        max: 20,
        heldPaise: 0,
        addons: [
            {
                id: "pack",
                kind: "products",
                module: null,
                name: "More things",
                mode: "pack",
                qty: 100,
                pricePaise: 11_100,
                gstPaise: 1_998,
                totalPaise: 13_098,
                quantity: 0,
                heldPaise: 0,
                available: true,
                why: null,
                ...over,
            },
        ],
    });

    it("words a pack and what is held, from the API's sums", () => {
        expect(addonRows(view())[0]).toMatchObject({
            line: "+100 products for ₹111 a month",
            total: "",
        });
        expect(
            addonRows(view({ quantity: 2, heldPaise: 22_200 }))[0].total,
        ).toBe("2 × · ₹222 a month");
    });

    it("leaves out one the plan can't take unless it's held", () => {
        expect(addonRows(view({ available: false }))).toEqual([]);
        expect(
            addonRows(
                view({ available: false, quantity: 1, heldPaise: 11_100 }),
            ),
        ).toHaveLength(1);
    });
});
