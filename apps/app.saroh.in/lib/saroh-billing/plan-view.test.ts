import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { access } from "@/lib/billing/fixtures.test-data";

import type { SarohSubscription } from "./plan";
import type { AddonsView } from "./plan-view";
import { addonRows, pickerRows, yearlyOffer, yourPlan } from "./plan-view";

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
                c: { inc: true, text: "222", card: "222", limit: 222 },
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
                    fromPlanId: "b",
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
                    fromPlanId: "b",
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
        ]);
        expect(authorise.notes.every((n) => n.tone === "attention")).toBe(true);
        // A checkout waiting for its payment is confirmed, never started
        // again: that would be a second mandate (DEC-093, UX-003).
        expect(authorise.pending).toEqual({
            planName: "Plan C",
            expiresAt: "2026-10-05T00:00:00.000Z",
            handoff: null,
        });
    });

    it("says nothing when a new version keeps the same plan (N1)", () => {
        // Free v1 to Free v2: a version move, not a plan change.
        const v = yourPlan({
            access: access({
                plan: { id: "a", name: "Plan A" },
                pendingMove: {
                    planId: "a",
                    fromPlanId: "a",
                    version: 4,
                    from: "2026-11-01T00:00:00.000Z",
                    waiting: null,
                },
            }),
            subscription: sub({
                provider: null,
                plan: { ...sub().plan, key: "catalog.a", priceCents: 0 },
            }),
            catalog: CATALOG,
            liveVersion: 4,
            checkouts: null,
            addonsHeld: false,
        });
        expect(v.notes).toEqual([]);

        // Plan B v3 to Plan B v4, held at the provider: still nothing.
        const held = yourPlan({
            access: access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
                pendingMove: {
                    planId: "b",
                    fromPlanId: "b",
                    version: 4,
                    from: "2026-11-01T00:00:00.000Z",
                    waiting: "held",
                },
            }),
            subscription: sub(),
            catalog: CATALOG,
            liveVersion: 4,
            checkouts: null,
            addonsHeld: false,
        });
        expect(held.notes).toEqual([]);

        // A new price on the same plan, due and waiting: asks to authorise,
        // without calling it a move to another plan.
        const authorise = yourPlan({
            access: access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
                pendingMove: {
                    planId: "b",
                    fromPlanId: "b",
                    version: 4,
                    from: "2026-11-01T00:00:00.000Z",
                    waiting: "authorise",
                },
            }),
            subscription: sub(),
            catalog: CATALOG,
            liveVersion: 4,
            checkouts: null,
            addonsHeld: false,
        });
        expect(authorise.notes).toHaveLength(1);
        expect(authorise.notes[0]).toMatchObject({
            lead: "Plan B's new price was due to start on ",
            action: { label: "Authorise", planId: "b" },
        });
    });

    it("never contradicts a plan given for a while: it wins until it ends (N1)", () => {
        const base = {
            subscription: sub({
                provider: null,
                plan: { ...sub().plan, key: "catalog.a", priceCents: 0 },
            }),
            catalog: CATALOG,
            liveVersion: 4,
            checkouts: null,
            addonsHeld: false,
        };
        const given = {
            plan: { id: "c", name: "Plan C" },
            planOverride: {
                planKey: "c",
                expiresAt: "2027-12-31T00:00:00.000Z",
            },
        };
        // On Plan A underneath, which only changes version.
        const same = yourPlan({
            ...base,
            access: access({
                ...given,
                pendingMove: {
                    planId: "a",
                    fromPlanId: "a",
                    version: 4,
                    from: "2026-10-14T00:00:00.000Z",
                    waiting: null,
                },
            }),
        });
        expect(same.notes).toHaveLength(1);
        expect(same.notes[0]).toMatchObject({
            lead: "Plan C is yours, free, until ",
            tail: ". Then you're on Plan A unless you choose a plan below.",
        });

        // Underneath moving to another plan before the override ends: the
        // override's note says where it lands; no "changes to" beside it.
        const other = yourPlan({
            ...base,
            subscription: sub({ provider: null }),
            access: access({
                ...given,
                pendingMove: {
                    planId: "a",
                    fromPlanId: "b",
                    version: 4,
                    from: "2026-10-14T00:00:00.000Z",
                    waiting: null,
                },
            }),
        });
        expect(other.notes.map((n) => n.lead)).toEqual([
            "Plan C is yours, free, until ",
        ]);
        expect(other.notes[0]?.tail).toBe(
            ". Then you're on Plan A unless you choose a plan below.",
        );
    });

    it("names the real target plan when the plan does change (N1)", () => {
        const v = yourPlan({
            access: access({
                plan: { id: "c", name: "Plan C" },
                pricePaise: 22_200,
                pendingMove: {
                    planId: "b",
                    fromPlanId: "c",
                    version: 4,
                    from: "2026-10-14T00:00:00.000Z",
                    waiting: null,
                },
            }),
            subscription: sub({
                plan: { ...sub().plan, key: "catalog.c", priceCents: 22_200 },
            }),
            catalog: CATALOG,
            liveVersion: 4,
            checkouts: null,
            addonsHeld: false,
        });
        expect(v.notes).toEqual([
            expect.objectContaining({
                lead: "Your plan changes to Plan B on ",
                iso: "2026-10-14T00:00:00.000Z",
            }),
        ]);
    });

    it("says the 12-month term, and offers the one-tap renewal in its last days", () => {
        const base = {
            access: access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
            }),
            subscription: sub(),
            catalog: CATALOG,
            liveVersion: 3,
            addonsHeld: false,
        };
        const running = yourPlan({
            ...base,
            checkouts: {
                open: null,
                scheduled: null,
                term: {
                    endsAt: "2027-09-01T00:00:00.000Z",
                    payment: "AUTOPAY",
                    renewOpen: false,
                },
            },
        });
        expect(running.notes.at(-1)).toMatchObject({
            tone: "info",
            lead: "Your 12 monthly charges run to ",
            iso: "2027-09-01T00:00:00.000Z",
            action: null,
        });
        const ending = yourPlan({
            ...base,
            checkouts: {
                open: null,
                scheduled: null,
                term: {
                    endsAt: "2026-11-01T00:00:00.000Z",
                    payment: "AUTOPAY",
                    renewOpen: true,
                },
            },
        });
        expect(ending.notes.at(-1)).toMatchObject({
            tone: "attention",
            lead: "Your 12 months of Plan B end on ",
            action: { label: "Renew", planId: "b", cycle: "month" },
        });
        // Renewed: said once, and no renewal offered again.
        const renewed = yourPlan({
            ...base,
            checkouts: {
                open: null,
                scheduled: {
                    id: "co",
                    kind: "SCHEDULED",
                    status: "SCHEDULED",
                    plan: { id: "b", name: "Plan B", version: 3 },
                    cycle: "month",
                    pricePaise: 11_100,
                    startAt: "2026-11-01T00:00:00.000Z",
                    expiresAt: "2026-10-05T00:00:00.000Z",
                    createdAt: "2026-10-04T00:00:00.000Z",
                },
                term: {
                    endsAt: "2026-11-01T00:00:00.000Z",
                    payment: "AUTOPAY",
                    renewOpen: true,
                },
            },
        });
        expect(renewed.notes.map((n) => n.lead)).toEqual([
            "Your next 12 months of Plan B start on ",
        ]);
    });

    it("a year paid once has no next charge: it's paid to its end", () => {
        const v = yourPlan({
            access: access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
            }),
            subscription: sub({
                billingCycle: "year",
                currentPeriodEnd: "2027-10-01T00:00:00.000Z",
            }),
            catalog: CATALOG,
            liveVersion: 3,
            checkouts: {
                open: null,
                scheduled: null,
                term: {
                    endsAt: "2027-10-01T00:00:00.000Z",
                    payment: "ONE_TIME",
                    renewOpen: false,
                },
            },
            addonsHeld: false,
        });
        expect(v.next).toEqual({
            kind: "paidTo",
            iso: "2027-10-01T00:00:00.000Z",
        });
        expect(v.notes.at(-1)?.lead).toBe("Paid for the year, to ");
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
            ["Plan B", "₹111 a month + GST", true, null],
            ["Plan C", "₹222 a month + GST", false, "Upgrade"],
        ]);
    });

    it("says what each plan unlocks, from the catalogue's card lines (UX-045)", () => {
        const rows = pickerRows({
            catalog: CATALOG,
            subscription: sub(),
            cycle: "month",
            trials: new Set(),
        });
        expect(rows.map((r) => [r.lead, r.lines])).toEqual([
            ["", ["10"]],
            ["Everything in Plan A, plus:", ["100"]],
            ["Everything in Plan B, plus:", ["222"]],
        ]);
    });

    it("under a plan given for a while, that plan is the one it's on, with no trial on it (UX-044)", () => {
        const rows = pickerRows({
            catalog: CATALOG,
            subscription: sub({
                provider: null,
                currentPeriodEnd: null,
                plan: { ...sub().plan, key: "catalog.a", priceCents: 0 },
            }),
            cycle: "month",
            trials: new Set(["c"]),
            given: { planId: "c", until: "2027-12-31T00:00:00.000Z" },
        });
        expect(
            rows.map((r) => [r.name, r.current, r.cta, r.note, r.what]),
        ).toEqual([
            [
                "Plan A",
                false,
                null,
                { lead: "After ", iso: "2027-12-31T00:00:00.000Z" },
                "For A.",
            ],
            ["Plan B", false, "Switch", null, "For B."],
            [
                "Plan C",
                true,
                "Keep Plan C",
                {
                    lead: "You're on this until ",
                    iso: "2027-12-31T00:00:00.000Z",
                },
                "For C.",
            ],
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

    it("a first month that costs something is said with its amount, never as a free trial (DEC-093)", () => {
        const paidFirst = parseCatalog({
            ...CATALOG,
            plans: CATALOG.plans.map((p) =>
                p.id === "c"
                    ? { ...p, trial: { on: true, days: 30, firstPaise: 700 } }
                    : p,
            ),
        });
        const month = pickerRows({
            catalog: paidFirst,
            subscription: sub(),
            cycle: "month",
            trials: new Set(["c"]),
        });
        expect(month[2]).toMatchObject({
            cta: "Start with the first month",
            what: "For C. · first month ₹7 + GST",
        });
        // Yearly is one payment: no trial on it.
        const year = pickerRows({
            catalog: paidFirst,
            subscription: sub(),
            cycle: "year",
            trials: new Set(["c"]),
        });
        expect(year[2]).toMatchObject({ cta: "Upgrade", what: "For C." });
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
            ["₹1,110 a year + GST", false, "Bill yearly"],
            ["₹2,220 a year + GST", false, "Upgrade"],
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
