import type { Catalog } from "@saroh/pricing-catalog";
import { parseCatalog } from "@saroh/pricing-catalog";
import { describe, expect, it } from "vitest";

import { access } from "@/lib/billing/fixtures.test-data";

import type { SarohSubscription } from "./plan";
import type { AddonsView, RowQuote } from "./plan-view";
import {
    addonRows,
    cancelOffer,
    pickerRows,
    waitingMove,
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
            method: "Paid through Razorpay",
            status: [
                {
                    lead: "Next charge ₹111 + GST on ",
                    iso: "2026-11-01T00:00:00.000Z",
                },
            ],
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
            "Approve",
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
            tail: ". Approve the new amount to move to it. Until you do, you keep paying ₹111 a month + GST.",
            action: { label: "Approve", planId: "b" },
        });
    });

    describe("a new price for the plan it pays for (DEC-161)", () => {
        const pricedMove = (
            over: {
                waiting?: "held" | "authorise" | null;
                version?: number;
            } = {},
        ) =>
            access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
                pendingMove: {
                    planId: "b",
                    fromPlanId: "b",
                    version: over.version ?? 4,
                    from: "2026-12-01T00:00:00.000Z",
                    waiting: over.waiting ?? null,
                    pricePaise: 13_300,
                },
            });
        const base = {
            subscription: sub(),
            catalog: CATALOG,
            liveVersion: 4,
            checkouts: null,
            addonsHeld: false,
        };

        it("says the new amount and the date ahead, asks to approve it, and keeps the price until then", () => {
            const v = yourPlan({ ...base, access: pricedMove() });
            expect(v.notes).toHaveLength(1);
            expect(v.notes[0]).toEqual({
                kind: "priceChange",
                tone: "attention",
                lead: "Plan B's price changes to ₹133 a month + GST on ",
                iso: "2026-12-01T00:00:00.000Z",
                tail: ". Approve the new amount before then. Until you do, you keep paying ₹111 a month + GST.",
                action: { label: "Approve", planId: "b", cycle: "month" },
            });
        });

        it("names the new amount once it is due, and still keeps the price", () => {
            const v = yourPlan({
                ...base,
                access: pricedMove({ waiting: "authorise" }),
            });
            expect(v.notes[0]).toMatchObject({
                kind: "authorise",
                lead: "Plan B's new price, ₹133 a month + GST, was due to start on ",
                tail: ". Approve the new amount to move to it. Until you do, you keep paying ₹111 a month + GST.",
            });
        });

        it("offers no approval before its version is live", () => {
            const v = yourPlan({
                ...base,
                liveVersion: 3,
                access: pricedMove(),
            });
            expect(v.notes[0]).toMatchObject({
                kind: "priceChange",
                tail: ". We'll ask you to approve the new amount. Until you do, you keep paying ₹111 a month + GST.",
                action: null,
            });
        });

        it("asks nothing once the new amount is approved", () => {
            const v = yourPlan({
                ...base,
                access: pricedMove(),
                checkouts: {
                    open: null,
                    scheduled: {
                        id: "co",
                        kind: "SCHEDULED",
                        status: "SCHEDULED",
                        plan: { id: "b", name: "Plan B", version: 4 },
                        cycle: "month",
                        pricePaise: 13_300,
                        startAt: "2026-12-01T00:00:00.000Z",
                        expiresAt: "2026-10-05T00:00:00.000Z",
                        createdAt: "2026-10-04T00:00:00.000Z",
                        payment: "AUTOPAY",
                    },
                },
            });
            expect(v.notes.map((n) => n.kind)).toEqual(["renewed"]);
            expect(v.notes[0]).toMatchObject({
                lead: "Your next autopay for Plan B starts on ",
                tail: ", as you approved.",
            });
        });

        it("says nothing at the same price, or from an API that sends no price", () => {
            const same = access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
                pendingMove: {
                    planId: "b",
                    fromPlanId: "b",
                    version: 4,
                    from: "2026-12-01T00:00:00.000Z",
                    waiting: null,
                    pricePaise: 11_100,
                },
            });
            expect(yourPlan({ ...base, access: same }).notes).toEqual([]);
            const old = access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
                pendingMove: {
                    planId: "b",
                    fromPlanId: "b",
                    version: 4,
                    from: "2026-12-01T00:00:00.000Z",
                    waiting: null,
                },
            });
            expect(yourPlan({ ...base, access: old }).notes).toEqual([]);
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

    it("says how many charges the autopay covers, and asks to approve the next one in its last days (DEC-161)", () => {
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
            lead: "Your autopay covers 12 monthly charges, to ",
            iso: "2027-09-01T00:00:00.000Z",
            tail: ". Before it runs out, we ask you to approve the next one.",
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
            lead: "Your autopay for Plan B runs out on ",
            tail: ". Approve the next one to keep Plan B from that day, at today's price. Otherwise you move to Free then.",
            action: { label: "Approve", planId: "b", cycle: "month" },
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
            "Your next autopay for Plan B starts on ",
        ]);
        // An autopay made for another count says it.
        const sixty = yourPlan({
            ...base,
            checkouts: {
                open: null,
                scheduled: null,
                term: {
                    endsAt: "2030-09-01T00:00:00.000Z",
                    payment: "AUTOPAY",
                    renewOpen: false,
                    charges: 60,
                },
            },
        });
        expect(sixty.notes.at(-1)?.lead).toBe(
            "Your autopay covers 60 monthly charges, to ",
        );
        for (const v of [running, ending, renewed, sixty]) {
            for (const n of v.notes) {
                expect(`${n.lead} ${n.tail}`).not.toMatch(
                    /\bterm\b|price doesn't change|pay for the next term/i,
                );
            }
        }
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
    it("marks the billed plan, and offers each other as an upgrade or a move, named", () => {
        const rows = pickerRows({
            catalog: CATALOG,
            subscription: sub(),
            cycle: "month",
            trials: new Set(),
        });
        expect(rows.map((r) => [r.name, r.price, r.current, r.cta])).toEqual([
            [
                "Plan A",
                "₹0",
                false,
                { label: "Move to Plan A", iso: null, primary: false },
            ],
            ["Plan B", "₹111 a month + GST", true, null],
            [
                "Plan C",
                "₹222 a month + GST",
                false,
                { label: "Upgrade to Plan C", iso: null, primary: true },
            ],
        ]);
        // The price in two sizes: the amount, then what it is for.
        expect(rows.map((r) => [r.amount, r.per])).toEqual([
            ["₹0", ""],
            ["₹111", "a month + GST"],
            ["₹222", "a month + GST"],
        ]);
    });

    it("shows every line of a plan, not the first few", () => {
        const many = parseCatalog({
            ...CATALOG,
            modules: ["one", "two", "three", "four", "five", "six"].map(
                (id) => ({
                    id,
                    name: id,
                    group: "g",
                    what: `${id}.`,
                    cells: {
                        a: { inc: false, text: "" },
                        b: { inc: false, text: "" },
                        c: { inc: true, text: id, card: `Line ${id}` },
                    },
                }),
            ),
        });
        const rows = pickerRows({
            catalog: many,
            subscription: sub(),
            cycle: "month",
            trials: new Set(),
        });
        expect(rows[2].lead).toBe("Everything in Plan B, plus:");
        expect(rows[2].lines).toEqual([
            "Line one",
            "Line two",
            "Line three",
            "Line four",
            "Line five",
            "Line six",
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
            rows.map((r) => [
                r.name,
                r.current,
                r.cta?.label ?? null,
                r.note,
                r.what,
            ]),
        ).toEqual([
            [
                "Plan A",
                false,
                null,
                { lead: "After ", iso: "2027-12-31T00:00:00.000Z" },
                "For A.",
            ],
            ["Plan B", false, "Move to Plan B", null, "For B."],
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
            cta: { label: "Start 14-day trial", primary: true },
            what: "For C.",
            offer: "14-day free trial",
        });
        // No offer line on a plan this business would get none on.
        expect(trial.map((r) => r.offer)).toEqual([
            null,
            null,
            "14-day free trial",
        ]);
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
            cta: { label: "Start with the first month", primary: true },
            what: "For C.",
            offer: "First month ₹7 + GST",
        });
        // Yearly is one payment: no trial on it.
        const year = pickerRows({
            catalog: paidFirst,
            subscription: sub(),
            cycle: "year",
            trials: new Set(["c"]),
        });
        expect(year[2]).toMatchObject({
            cta: { label: "Upgrade to Plan C" },
            what: "For C.",
            offer: null,
        });
    });

    it("prices yearly by the catalogue's rule, and offers billing the plan yearly", () => {
        const rows = pickerRows({
            catalog: CATALOG,
            subscription: sub(),
            cycle: "year",
            trials: new Set(),
        });
        expect(
            rows.map((r) => [r.price, r.current, r.cta?.label ?? null]),
        ).toEqual([
            ["₹0", false, "Move to Plan A"],
            ["₹1,110 a year + GST", false, "Bill yearly"],
            ["₹2,220 a year + GST", false, "Upgrade to Plan C"],
        ]);
        expect(rows[1]).toMatchObject({
            amount: "₹1,110",
            per: "a year + GST",
        });
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
        // From Free a paid plan is started, not upgraded to.
        expect(rows.map((r) => r.cta?.label ?? null)).toEqual([
            null,
            "Start Plan B",
            "Start 14-day trial",
        ]);
        expect(rows.map((r) => r.cta?.primary ?? null)).toEqual([
            null,
            true,
            true,
        ]);
    });
});

describe("pickerRows: when a change would start (DEC-159)", () => {
    const NOW = new Date("2026-10-13T00:00:00.000Z");
    const END = "2026-11-01T00:00:00.000Z";
    const q = (over: Partial<RowQuote>): RowQuote => ({
        kind: "SCHEDULED",
        effectiveAt: null,
        firstMonth: null,
        payNowTotalPaise: 0,
        ...over,
    });
    const onC = sub({
        status: "TRIALING",
        plan: { ...sub().plan, key: "catalog.c", priceCents: 22_200 },
    });

    it("an upgrade says it starts today and what is paid now; a cheaper plan and Free say the date and the plan kept", () => {
        const rows = pickerRows({
            catalog: CATALOG,
            subscription: sub(),
            cycle: "month",
            trials: new Set(),
            now: NOW,
            quotes: new Map([
                ["a", q({ kind: "TO_FREE", effectiveAt: END })],
                ["c", q({ kind: "UPGRADE", payNowTotalPaise: 6_549 })],
            ]),
        });
        expect(rows.map((r) => [r.name, r.cta, r.note])).toEqual([
            [
                "Plan A",
                // Moving down is the quiet button, and says its date.
                { label: "Move to Plan A from ", iso: END, primary: false },
                {
                    lead: "From ",
                    iso: END,
                    tail: ": you keep Plan B until then.",
                    brief: "You keep Plan B until then.",
                },
            ],
            ["Plan B", null, null],
            [
                "Plan C",
                { label: "Upgrade to Plan C", iso: null, primary: true },
                { lead: "Starts today: ₹65.49 now (incl. GST)", iso: null },
            ],
        ]);
    });

    it("during the first month: a dearer plan ends the month today, a cheaper one waits for its end, and neither offers a second first month", () => {
        const firstMonth = parseCatalog({
            ...CATALOG,
            plans: CATALOG.plans.map((p) =>
                p.pricePaise > 0
                    ? { ...p, trial: { on: true, days: 30, firstPaise: 700 } }
                    : p,
            ),
        });
        const up = pickerRows({
            catalog: firstMonth,
            subscription: sub({ status: "TRIALING" }),
            cycle: "month",
            // The API quotes no trial while a first month runs.
            trials: new Set(),
            now: NOW,
            quotes: new Map([
                [
                    "a",
                    q({
                        kind: "TO_FREE",
                        effectiveAt: END,
                        firstMonth: "AT_END",
                    }),
                ],
                [
                    "c",
                    q({
                        kind: "NEW",
                        firstMonth: "NOW",
                        payNowTotalPaise: 26_196,
                    }),
                ],
            ]),
        });
        expect(up[2]).toMatchObject({
            cta: { label: "Upgrade to Plan C", iso: null, primary: true },
            what: "For C.",
            offer: null,
            note: {
                lead: "Starts today: ₹261.96 now (incl. GST). Your first month on Plan B ends.",
                iso: null,
            },
        });
        expect(up[0]).toMatchObject({
            cta: { label: "Move to Plan A from ", iso: END, primary: false },
            note: {
                lead: "From ",
                iso: END,
                tail: ": you keep Plan B until then.",
            },
        });

        const down = pickerRows({
            catalog: firstMonth,
            subscription: onC,
            cycle: "month",
            trials: new Set(),
            now: NOW,
            quotes: new Map([
                [
                    "b",
                    q({
                        kind: "SCHEDULED",
                        effectiveAt: END,
                        firstMonth: "AT_END",
                    }),
                ],
            ]),
        });
        expect(down[1]).toMatchObject({
            cta: { label: "Move to Plan B from ", iso: END, primary: false },
            what: "For B.",
            offer: null,
            note: {
                lead: "From ",
                iso: END,
                tail: ": you keep Plan C until then.",
            },
        });
    });

    it("a change that already waits says its date on its row, with no button to make it twice", () => {
        const rows = pickerRows({
            catalog: CATALOG,
            subscription: onC,
            cycle: "month",
            trials: new Set(),
            now: NOW,
            quotes: new Map([
                ["a", q({ kind: "TO_FREE", effectiveAt: END })],
                ["b", q({ kind: "SCHEDULED", effectiveAt: END })],
            ]),
            waiting: { planId: "b", iso: END, cycle: "month" },
        });
        expect(
            rows.map((r) => [
                r.name,
                r.cta?.label ?? null,
                r.scheduled,
                r.note?.tail ?? null,
            ]),
        ).toEqual([
            [
                "Plan A",
                "Move to Plan A from ",
                null,
                ": you keep Plan C until then.",
            ],
            // The plan the change waits for: its date, and no button.
            ["Plan B", null, END, ": you keep Plan C until then."],
            ["Plan C", null, null, null],
        ]);
        // Authorised monthly: the yearly row of the same plan still offers.
        const year = pickerRows({
            catalog: CATALOG,
            subscription: onC,
            cycle: "year",
            trials: new Set(),
            now: NOW,
            waiting: { planId: "b", iso: END, cycle: "month" },
        });
        expect(year[1]).toMatchObject({
            cta: { label: "Move to Plan B" },
            scheduled: null,
            note: null,
        });
    });

    it("says nothing of timing without a quote, or once the date has passed", () => {
        const rows = pickerRows({
            catalog: CATALOG,
            subscription: sub(),
            cycle: "month",
            trials: new Set(),
            now: NOW,
            quotes: new Map([
                ["a", q({ kind: "TO_FREE", effectiveAt: NOW.toISOString() })],
            ]),
        });
        expect(rows.map((r) => r.note)).toEqual([null, null, null]);
        expect(rows.map((r) => r.cta?.label ?? null)).toEqual([
            "Move to Plan A",
            null,
            "Upgrade to Plan C",
        ]);
    });
});

describe("waitingMove (DEC-159)", () => {
    const END = "2026-11-01T00:00:00.000Z";
    const scheduled = (planId: string, cycle = "month") => ({
        id: "co",
        kind: "SCHEDULED",
        status: "SCHEDULED",
        plan: { id: planId, name: planId, version: 3 },
        cycle,
        pricePaise: 11_100,
        startAt: END,
        expiresAt: END,
        createdAt: END,
    });
    const on = access({ plan: { id: "c", name: "Plan C" } });

    it("is the plan authorised for the date, on the cycle it was authorised on", () => {
        expect(
            waitingMove({
                access: on,
                checkouts: { open: null, scheduled: scheduled("b") },
            }),
        ).toEqual({ planId: "b", iso: END, cycle: "month" });
    });

    it("is Free chosen for the end of what is paid", () => {
        expect(
            waitingMove({
                access: access({
                    plan: { id: "c", name: "Plan C" },
                    pendingMove: {
                        planId: "a",
                        fromPlanId: "c",
                        version: 3,
                        from: END,
                        waiting: null,
                    },
                }),
                checkouts: { open: null, scheduled: null },
            }),
        ).toEqual({ planId: "a", iso: END, cycle: null });
    });

    it("is nothing for the plan's own renewal, its next version, or a move that waits on someone", () => {
        expect(
            waitingMove({
                access: on,
                checkouts: { open: null, scheduled: scheduled("c") },
            }),
        ).toBeNull();
        const move = {
            planId: "c",
            fromPlanId: "c",
            version: 4,
            from: END,
            waiting: null,
        };
        expect(
            waitingMove({
                access: access({ ...on, pendingMove: move }),
                checkouts: null,
            }),
        ).toBeNull();
        expect(
            waitingMove({
                access: access({
                    ...on,
                    pendingMove: { ...move, planId: "b", waiting: "authorise" },
                }),
                checkouts: null,
            }),
        ).toBeNull();
    });
});

describe("yourPlan: leaving at the end of what is paid (DEC-159)", () => {
    it("in the first month it says when the plan ends, and nothing of charges it will never take", () => {
        const END = "2026-11-01T00:00:00.000Z";
        const v = yourPlan({
            access: access({
                plan: { id: "b", name: "Plan B" },
                pricePaise: 11_100,
                pendingMove: {
                    planId: "a",
                    fromPlanId: "b",
                    version: 3,
                    from: END,
                    waiting: null,
                },
            }),
            subscription: sub({
                status: "TRIALING",
                cancelAtPeriodEnd: true,
                currentPeriodEnd: END,
            }),
            catalog: CATALOG,
            liveVersion: 3,
            checkouts: {
                open: null,
                scheduled: null,
                term: {
                    endsAt: "2027-11-01T00:00:00.000Z",
                    payment: "AUTOPAY",
                    renewOpen: false,
                },
            },
            addonsHeld: false,
        });
        expect(v.next).toEqual({ kind: "ends", iso: END });
        expect(v.notes).toEqual([
            {
                kind: "move",
                tone: "info",
                lead: "Your plan changes to Plan A on ",
                iso: END,
                tail: ". Everything stays until then.",
                action: null,
            },
        ]);
    });
});

describe("cancelOffer: Cancel plan (owner, 17 Oct 2026)", () => {
    const onB = access({
        plan: { id: "b", name: "Plan B" },
        pricePaise: 11_100,
    });
    const yearlySub = () =>
        sub({
            billingCycle: "year",
            plan: { ...sub().plan, interval: "year", priceCents: 111_000 },
        });
    const offer = (over: Partial<Parameters<typeof cancelOffer>[0]> = {}) =>
        cancelOffer({
            catalog: CATALOG,
            subscription: sub(),
            access: onB,
            checkouts: null,
            ...over,
        });

    it("is offered on a paid plan the business is billed for, with Free to move to", () => {
        expect(offer()).toEqual({
            planName: "Plan B",
            freePlanId: "a",
            freePlanName: "Plan A",
            yearly: false,
        });
        expect(
            offer({ subscription: sub({ status: "TRIALING" }) }),
        ).not.toBeNull();
        expect(
            offer({ subscription: sub({ status: "PAST_DUE" }) }),
        ).not.toBeNull();
    });

    it("says a year paid once is yearly", () => {
        expect(offer({ subscription: yearlySub() })?.yearly).toBe(true);
    });

    it("is drawn by yourPlan, and left out once the plan is ending", () => {
        const base = {
            catalog: CATALOG,
            liveVersion: 3,
            checkouts: null,
            addonsHeld: false,
        };
        expect(
            yourPlan({ ...base, access: onB, subscription: sub() }).cancel,
        ).toMatchObject({ planName: "Plan B" });
        expect(
            yourPlan({
                ...base,
                access: onB,
                subscription: sub({ cancelAtPeriodEnd: true }),
            }).cancel,
        ).toBeNull();
    });

    it("is not offered on Free, an ended plan, or one not billed through a provider", () => {
        const free = sub({
            plan: {
                ...sub().plan,
                key: "catalog.a",
                name: "Plan A",
                priceCents: 0,
            },
        });
        expect(offer({ subscription: free })).toBeNull();
        expect(offer({ subscription: null })).toBeNull();
        expect(
            offer({ subscription: sub({ status: "CANCELLED" }) }),
        ).toBeNull();
        expect(offer({ subscription: sub({ provider: null }) })).toBeNull();
        expect(offer({ catalog: null })).toBeNull();
    });

    it("is not offered while a move to another plan already waits", () => {
        expect(
            offer({
                access: access({
                    plan: { id: "b", name: "Plan B" },
                    pricePaise: 11_100,
                    pendingMove: {
                        planId: "a",
                        fromPlanId: "b",
                        version: 3,
                        from: "2026-11-01T00:00:00.000Z",
                        waiting: null,
                    },
                }),
            }),
        ).toBeNull();
    });

    it("is not offered under a plan given for a while", () => {
        expect(
            offer({
                access: access({
                    plan: { id: "c", name: "Plan C" },
                    pricePaise: 22_200,
                    planOverride: {
                        planKey: "c",
                        expiresAt: "2027-01-03T00:00:00.000Z",
                    },
                }),
            }),
        ).toBeNull();
    });

    it("is not offered on a year whose next year is paid already", () => {
        const scheduled = {
            id: "co",
            kind: "SCHEDULED",
            status: "SCHEDULED",
            plan: { id: "b", name: "Plan B", version: 3 },
            cycle: "year",
            pricePaise: 111_000,
            startAt: "2026-11-01T00:00:00.000Z",
            expiresAt: "2026-11-01T00:00:00.000Z",
            createdAt: "2026-10-01T00:00:00.000Z",
            payment: "ONE_TIME" as const,
        };
        expect(
            offer({
                subscription: yearlySub(),
                checkouts: { open: null, scheduled, term: null },
            }),
        ).toBeNull();
        // Monthly: the next autopay approved stops with the rest.
        expect(
            offer({
                checkouts: {
                    open: null,
                    scheduled: {
                        ...scheduled,
                        cycle: "month",
                        payment: "AUTOPAY",
                    },
                    term: null,
                },
            }),
        ).not.toBeNull();
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

    it("says the plan's own maximum, and keeps what is held above it (DEC-157)", () => {
        // None of its own: the ceiling, and nothing said.
        expect(addonRows(view())[0]).toMatchObject({
            max: 20,
            line: "+100 products for ₹111 a month",
        });
        expect(addonRows(view({ max: 4 }))[0]).toMatchObject({
            max: 4,
            line: "+100 products for ₹111 a month, up to 4",
        });
        expect(
            addonRows(view({ max: 4, mode: "unit", kind: "members" }))[0].line,
        ).toBe("₹111 a month per team member, up to 4");
        // Held from before the maximum came down: shown as held.
        expect(
            addonRows(view({ max: 4, quantity: 6, heldPaise: 66_600 }))[0],
        ).toMatchObject({ quantity: 6, max: 4, total: "6 × · ₹666 a month" });
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
