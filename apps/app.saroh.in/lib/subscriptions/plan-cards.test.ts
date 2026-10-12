import { describe, expect, it } from "vitest";

import type { MissingRates } from "@/lib/gst-rates/missing";

import {
    archiveToast,
    inPlanView,
    livePlans,
    missingRatesAlso,
    PLAN_VIEW_LABEL,
    PLAN_VIEWS,
    planRow,
    plansShowClasses,
} from "./plan-cards";
import type { Plan } from "./service";

const plan = (over: Partial<Plan> = {}): Plan => ({
    id: "p1",
    name: "Standard membership",
    description: "Eight classes a month and the gym floor.",
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

describe("planRow (D3)", () => {
    it("says the price, the classes, who is on it and the older prices", () => {
        expect(planRow(plan(), true)).toEqual({
            id: "p1",
            name: "Standard membership",
            price: "₹1,500 a month",
            classes: "8 classes a month",
            subscribers: 15,
            monthly: "₹21,600",
            olderPrices: ["3 still on ₹1,200, and they keep it"],
            archived: false,
            draft: false,
            unpublished: false,
            canArchive: true,
        });
    });

    it("says unlimited classes for a plan with no cap", () => {
        expect(planRow(plan({ classesPerMonth: null }), true).classes).toBe(
            "Unlimited classes",
        );
    });

    it("says nothing about classes where the business sells none", () => {
        expect(planRow(plan(), false).classes).toBeNull();
    });

    it("has nothing coming in on a plan nobody is on", () => {
        const card = planRow(
            plan({ subscriberCount: 0, byPrice: [], monthlyFromMembers: "0" }),
            false,
        );
        expect(card.subscribers).toBe(0);
        expect(card.monthly).toBeNull();
        expect(card.olderPrices).toEqual([]);
    });

    it("has nothing coming in when everyone on it is paused", () => {
        const card = planRow(
            plan({ subscriberCount: 1, monthlyFromMembers: "0.00" }),
            false,
        );
        expect(card.subscribers).toBe(1);
        expect(card.monthly).toBeNull();
    });

    it("rounds what it brings in to the rupee", () => {
        expect(
            planRow(plan({ monthlyFromMembers: "1516.67" }), false).monthly,
        ).toBe("₹1,517");
    });

    it("says a yearly plan's price per year", () => {
        expect(
            planRow(plan({ price: "12000.00", interval: "YEAR" }), false).price,
        ).toBe("₹12,000 a year");
    });

    it("marks an archived plan, which can be sold again", () => {
        const card = planRow(plan({ status: "ARCHIVED" }), false);
        expect(card.archived).toBe(true);
        expect(card.canArchive).toBe(true);
    });

    it("badges a draft, which has nothing to archive", () => {
        const card = planRow(
            plan({ status: "DRAFT", pendingChangedAt: "2026-09-20T00:00:00Z" }),
            false,
        );
        expect(card.draft).toBe(true);
        expect(card.canArchive).toBe(false);
        // A draft's edits are the draft itself, not unpublished changes.
        expect(card.unpublished).toBe(false);
    });

    it("marks a live plan with changes nobody has published", () => {
        expect(
            planRow(plan({ pendingChangedAt: "2026-09-20T00:00:00Z" }), false)
                .unpublished,
        ).toBe(true);
        expect(
            planRow(plan({ pendingChangedAt: null }), false).unpublished,
        ).toBe(false);
    });
});

describe("the Plans list's views", () => {
    const all = [
        { status: "ACTIVE" },
        { status: "ACTIVE" },
        { status: "DRAFT" },
        { status: "ARCHIVED" },
    ] as const;

    it("opens on Live, then Archived, Drafts and all of them", () => {
        expect(PLAN_VIEWS).toEqual(["live", "archived", "drafts", "all"]);
        expect(PLAN_VIEWS.map((v) => PLAN_VIEW_LABEL[v])).toEqual([
            "Live",
            "Archived",
            "Drafts",
            "All plans",
        ]);
    });

    it("puts each plan in the view of its status, and all in the last", () => {
        const counts = PLAN_VIEWS.map(
            (v) => all.filter((p) => inPlanView(p, v)).length,
        );
        expect(counts).toEqual([2, 1, 1, 4]);
    });

    it("the tab counts the plans on sale now, and nothing else", () => {
        expect(livePlans(all)).toBe(2);
        expect(livePlans([])).toBe(0);
    });
});

describe("missingRatesAlso", () => {
    const plans = [
        { id: "p1", status: "ACTIVE" },
        { id: "p2", status: "ARCHIVED" },
        { id: "p3", status: "ARCHIVED" },
    ] as const;
    const missing = (
        ids: string[],
        over: Partial<MissingRates> = {},
    ): MissingRates => ({
        registered: true,
        items: ids.map((id) => ({ kind: "PLAN", id, name: id })),
        more: false,
        ...over,
    });

    it("says how many of the plans it counts are archived ones", () => {
        expect(missingRatesAlso(plans, missing(["p1", "p2", "p3"]))).toBe(
            "2 of them are archived, with members still on them.",
        );
        expect(missingRatesAlso(plans, missing(["p1", "p2"]))).toBe(
            "1 of them is archived, with members still on it.",
        );
    });

    it("names the plans when other things are counted too", () => {
        const mixed = missing(["p2"]);
        mixed.items.push({ kind: "SERVICE", id: "s1", name: "Haircut" });
        expect(missingRatesAlso(plans, mixed)).toBe(
            "1 of the plans is archived, with members still on it.",
        );
    });

    it("says nothing when every plan it counts is live", () => {
        expect(missingRatesAlso(plans, missing(["p1"]))).toBeNull();
        expect(missingRatesAlso(plans, missing([]))).toBeNull();
    });

    it("says nothing when it can't know: unread, not registered, or a partial list", () => {
        expect(missingRatesAlso(plans, null)).toBeNull();
        expect(
            missingRatesAlso(plans, missing(["p2"], { registered: false })),
        ).toBeNull();
        expect(
            missingRatesAlso(plans, missing(["p2"], { more: true })),
        ).toBeNull();
    });
});

describe("archiveToast", () => {
    it("says who carries on when a plan is archived", () => {
        expect(
            archiveToast({ name: "Drop-in", subscriberCount: 4 }, true),
        ).toBe(
            "Drop-in archived. Its 4 subscribers carry on, and nobody new can join.",
        );
        expect(
            archiveToast({ name: "Drop-in", subscriberCount: 1 }, true),
        ).toBe(
            "Drop-in archived. Its 1 subscriber carries on, and nobody new can join.",
        );
        expect(
            archiveToast({ name: "Drop-in", subscriberCount: 0 }, true),
        ).toBe("Drop-in archived. Nobody new can join.");
    });

    it("says a plan sold again is open to sign-ups", () => {
        expect(
            archiveToast({ name: "Drop-in", subscriberCount: 4 }, false),
        ).toBe("Drop-in is open to sign-ups again.");
    });
});

describe("plansShowClasses", () => {
    it("follows Appointments when it is known", () => {
        expect(plansShowClasses(true, [])).toBe(true);
        expect(plansShowClasses(false, [{ classesPerMonth: 8 }])).toBe(false);
    });

    it("falls back to whether any plan counts classes", () => {
        expect(plansShowClasses(null, [{ classesPerMonth: 8 }])).toBe(true);
        expect(plansShowClasses(null, [{ classesPerMonth: null }])).toBe(false);
    });
});
