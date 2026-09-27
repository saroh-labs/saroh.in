import { describe, expect, it } from "vitest";

import {
    detailTabFromQuery,
    eventWhat,
    eventWho,
    glanceRows,
    historyRows,
    includedText,
    planHeader,
    priceChangesText,
    subscriberRows,
    subscribersEmptyText,
} from "./plan-detail";
import type { Plan, PlanEvent, PlanEventsPage, Subscription } from "./service";

const NOW = new Date("2026-09-18T06:30:00Z");
const TZ = "Asia/Kolkata";

const plan = (over: Partial<Plan> = {}): Plan => ({
    id: "p1",
    name: "Standard membership",
    description: "Gym floor and classes, any time",
    price: "1500.00",
    currency: "INR",
    interval: "MONTH",
    status: "ACTIVE",
    classesPerMonth: 8,
    subscriberCount: 15,
    byPrice: [
        {
            price: "1500.00",
            currency: "INR",
            interval: "MONTH",
            count: 12,
            current: true,
        },
        {
            price: "1200.00",
            currency: "INR",
            interval: "MONTH",
            count: 3,
            current: false,
        },
    ],
    monthly: "1500.00",
    monthlyFromMembers: "21600.00",
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
});

const event = (over: Partial<PlanEvent> = {}): PlanEvent => ({
    id: "e1",
    kind: "PRICE_CHANGED",
    changes: { price: ["1200.00", "1500.00"] },
    actor: { kind: "TEAM", userId: "u1", name: "Priya Raman" },
    createdAt: "2026-09-03T05:00:00.000Z",
    ...over,
});

const page = (over: Partial<PlanEventsPage> = {}): PlanEventsPage => ({
    events: [event()],
    nextCursor: null,
    earlierUnrecorded: false,
    ...over,
});

const sub = (over: Partial<Subscription> = {}): Subscription => ({
    id: "s1",
    status: "ACTIVE",
    plan: { id: "p1", name: "Standard membership" },
    contact: { id: "c1", name: "Ananya Rao", email: "ananya@example.in" },
    price: "1500.00",
    currency: "INR",
    interval: "MONTH",
    timezone: TZ,
    currentPeriodStart: "2026-09-04T00:00:00.000Z",
    currentPeriodEnd: "2026-10-04T00:00:00.000Z",
    nextRenewalAt: "2026-10-03T18:30:00.000Z",
    startsAt: null,
    endsAt: null,
    pausedAt: null,
    pausedUntil: null,
    cancelledAt: null,
    overdue: false,
    overdueCount: 0,
    unpaidCount: 0,
    unpaidTotal: "0.00",
    oldestUnpaid: null,
    latestInvoice: null,
    paymentFailed: false,
    failedCharge: null,
    collection: null,
    pendingPlan: null,
    startedAt: "2026-01-03T18:30:00.000Z",
    createdAt: "2026-01-03T18:30:00.000Z",
    ...over,
});

describe("detailTabFromQuery", () => {
    it("opens the tab the address names, and Overview otherwise", () => {
        expect(detailTabFromQuery("history")).toBe("history");
        expect(detailTabFromQuery("subscribers")).toBe("subscribers");
        expect(detailTabFromQuery("subs")).toBe("subscribers");
        expect(detailTabFromQuery(undefined)).toBe("overview");
        expect(detailTabFromQuery("nonsense")).toBe("overview");
    });
});

describe("planHeader", () => {
    it("says an open plan's price, classes and how many are on it", () => {
        const h = planHeader(plan(), true);
        expect(h.state).toEqual({ label: "Open", tone: "ok" });
        expect(h.subline).toBe(
            "₹1,500 every month · 8 classes a month · 15 people on it",
        );
        expect(h.archiveLabel).toBe("Archive");
        expect(h.banner).toBeNull();
        expect(h.unpublished).toBe(false);
    });

    it("leaves classes out where they aren't sold, and says one person", () => {
        expect(planHeader(plan({ subscriberCount: 1 }), false).subline).toBe(
            "₹1,500 every month · 1 person on it",
        );
        expect(
            planHeader(plan({ classesPerMonth: null }), true).subline,
        ).toContain("unlimited classes");
    });

    it("an archived plan says Archived and offers to open it again", () => {
        const h = planHeader(plan({ status: "ARCHIVED" }), false);
        expect(h.state).toEqual({ label: "Archived", tone: "off" });
        expect(h.archiveLabel).toBe("Open to sign-ups");
        expect(h.banner).toMatch(/^Archived — nobody new can join/);
    });

    it("a draft is finished, not archived, and never 'unpublished'", () => {
        const h = planHeader(
            plan({ status: "DRAFT", pendingChangedAt: "2026-09-10T00:00:00Z" }),
            false,
        );
        expect(h.state.label).toBe("Draft");
        expect(h.archiveLabel).toBe("Finish draft");
        expect(h.banner).toMatch(/draft/);
        expect(h.unpublished).toBe(false);
    });

    it("a live plan with pending changes says so (after D5)", () => {
        expect(
            planHeader(
                plan({ pendingChangedAt: "2026-09-10T00:00:00Z" }),
                false,
            ).unpublished,
        ).toBe(true);
    });
});

describe("includedText", () => {
    it("says the description and the classes, which don't carry over", () => {
        expect(includedText(plan(), true)).toEqual({
            what: "Gym floor and classes, any time",
            classes: "8 classes each month. Unused ones don't carry over.",
        });
        expect(
            includedText(plan({ classesPerMonth: null }), true).classes,
        ).toBe("Unlimited classes.");
    });

    it("says there's no description, and no classes where none are sold", () => {
        expect(includedText(plan({ description: "  " }), false)).toEqual({
            what: "No description yet.",
            classes: null,
        });
    });
});

describe("eventWhat", () => {
    it("says a price change in the plan's money", () => {
        expect(eventWhat(event(), "INR")).toBe(
            "Changed the price from ₹1,200 to ₹1,500",
        );
    });

    it("says the interval with the price when both changed", () => {
        expect(
            eventWhat(
                event({
                    kind: "PRICE_CHANGED",
                    changes: {
                        price: ["1200.00", "12000.00"],
                        interval: ["MONTH", "YEAR"],
                    },
                }),
                "INR",
            ),
        ).toBe("Changed the price from ₹1,200 / month to ₹12,000 / year");
        expect(
            eventWhat(
                event({ changes: { interval: ["MONTH", "QUARTER"] } }),
                "INR",
            ),
        ).toBe("Changed billing from every month to every quarter");
    });

    it("says classes, a rename and what's included", () => {
        expect(
            eventWhat(
                event({
                    kind: "CLASSES_CHANGED",
                    changes: { classesPerMonth: [8, null] },
                }),
                "INR",
            ),
        ).toBe("Changed classes from 8 a month to unlimited");
        expect(
            eventWhat(
                event({
                    kind: "RENAMED",
                    changes: { name: ["Monthly", "Standard"] },
                }),
                "INR",
            ),
        ).toBe("Renamed it from “Monthly” to “Standard”");
        expect(
            eventWhat(
                event({
                    kind: "DESCRIPTION_CHANGED",
                    changes: { description: [null, "Gym floor"] },
                }),
                "INR",
            ),
        ).toBe("Added what's included");
    });

    it("an edit of several fields says each, in one line", () => {
        expect(
            eventWhat(
                event({
                    kind: "UPDATED",
                    changes: {
                        name: ["Monthly", "Standard"],
                        price: ["1200.00", "1500.00"],
                        classesPerMonth: [4, 8],
                    },
                }),
                "INR",
            ),
        ).toBe(
            "Renamed it from “Monthly” to “Standard”; changed the price from ₹1,200 to ₹1,500; changed classes from 4 a month to 8 a month",
        );
    });

    it("says creation with its price, archive and opening again", () => {
        expect(
            eventWhat(
                event({
                    kind: "CREATED",
                    changes: {
                        name: [null, "Standard"],
                        price: [null, "1500.00"],
                        currency: [null, "INR"],
                        interval: [null, "MONTH"],
                        status: [null, "ACTIVE"],
                    },
                }),
                "INR",
            ),
        ).toBe("Created at ₹1,500 / month");
        expect(eventWhat(event({ kind: "ARCHIVED", changes: {} }), "INR")).toBe(
            "Archived — closed to new sign-ups",
        );
        expect(eventWhat(event({ kind: "RESTORED", changes: {} }), "INR")).toBe(
            "Opened to new sign-ups again",
        );
    });
});

describe("eventWho", () => {
    it("names the team member, Saroh support, or someone unnamed", () => {
        expect(eventWho(event())).toBe("Priya Raman");
        expect(
            eventWho(
                event({
                    actor: {
                        kind: "OPERATOR",
                        userId: null,
                        name: "Saroh support",
                    },
                }),
            ),
        ).toBe("Saroh support");
        expect(
            eventWho(
                event({ actor: { kind: "TEAM", userId: "u2", name: null } }),
            ),
        ).toBe("Someone on your team");
    });
});

describe("historyRows", () => {
    it("dates each row, and says when earlier changes weren't recorded", () => {
        const rows = historyRows(
            [event()],
            { nextCursor: null, earlierUnrecorded: true },
            "INR",
            TZ,
            NOW,
        );
        expect(rows).toEqual([
            {
                id: "e1",
                date: "3 Sep",
                what: "Changed the price from ₹1,200 to ₹1,500",
                who: "Priya Raman",
            },
            {
                id: "earlier",
                date: "",
                what: "Earlier changes weren't recorded",
                who: "",
            },
        ]);
    });

    it("says nothing about the end while there are older pages", () => {
        const rows = historyRows(
            [event()],
            { nextCursor: "e1", earlierUnrecorded: true },
            "INR",
            TZ,
            NOW,
        );
        expect(rows).toHaveLength(1);
    });

    it("an empty history says nothing has happened", () => {
        expect(
            historyRows(
                [],
                { nextCursor: null, earlierUnrecorded: false },
                "INR",
                TZ,
                NOW,
            )[0].what,
        ).toBe("Nothing has happened yet.");
    });
});

describe("priceChangesText and glanceRows", () => {
    it("counts price changes exactly when the whole history is here", () => {
        const created = event({
            id: "e0",
            kind: "CREATED",
            changes: { price: [null, "1200.00"] },
        });
        expect(priceChangesText(page({ events: [event(), created] }))).toBe(
            "1",
        );
    });

    it("never claims an exact count it can't know", () => {
        expect(priceChangesText(null)).toBe("—");
        expect(priceChangesText(page({ nextCursor: "e1" }))).toBe("1+");
        expect(priceChangesText(page({ earlierUnrecorded: true }))).toBe(
            "1 recorded",
        );
        expect(
            priceChangesText(page({ events: [], earlierUnrecorded: true })),
        ).toBe("None recorded");
    });

    it("says who's on it and what they bring in a month", () => {
        expect(glanceRows(plan(), page())).toEqual([
            { label: "On it now", value: "15" },
            { label: "Coming in a month", value: "₹21,600" },
            { label: "Price changes", value: "1" },
        ]);
        expect(
            glanceRows(plan({ monthlyFromMembers: "0.00" }), null)[1].value,
        ).toBe("—");
    });
});

describe("subscriberRows", () => {
    it("says each person's standing, price and next date, ended last", () => {
        const rows = subscriberRows(
            [
                sub({
                    id: "gone",
                    status: "CANCELLED",
                    cancelledAt: "2026-09-10T06:00:00.000Z",
                }),
                sub({ id: "old", price: "1200.00" }),
                sub({ id: "paused", status: "PAUSED" }),
            ],
            plan(),
            NOW,
        );
        expect(rows.map((r) => r.id)).toEqual(["old", "paused", "gone"]);
        expect(rows[0]).toMatchObject({
            name: "Ananya Rao",
            since: "Since 4 Jan",
            status: { label: "Active", tone: "ok" },
            price: "₹1,200 / month",
            olderPrice: true,
            when: "Next 4 Oct",
        });
        expect(rows[1]).toMatchObject({ when: "Paused", olderPrice: false });
        expect(rows[2]).toMatchObject({
            status: { label: "Cancelled", tone: "off" },
            when: "Ended 10 Sep",
        });
    });

    it("a failed renewal says so", () => {
        expect(
            subscriberRows([sub({ paymentFailed: true })], plan(), NOW)[0]
                .status,
        ).toEqual({ label: "Payment failed", tone: "bad" });
    });
});

describe("subscribersEmptyText", () => {
    it("says why nobody's on it", () => {
        expect(subscribersEmptyText(plan())).toMatch(/When someone signs up/);
        expect(subscribersEmptyText(plan({ status: "ARCHIVED" }))).toMatch(
            /archived/,
        );
        expect(subscribersEmptyText(plan({ status: "DRAFT" }))).toMatch(
            /Publish/,
        );
    });
});
