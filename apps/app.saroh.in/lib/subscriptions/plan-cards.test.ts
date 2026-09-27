import { describe, expect, it } from "vitest";

import {
    archiveToast,
    planCard,
    plansOnTab,
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

describe("planCard (D3)", () => {
    it("says the price, the classes, who is on it and the older prices", () => {
        expect(planCard(plan(), true)).toEqual({
            id: "p1",
            name: "Standard membership",
            description: "Eight classes a month and the gym floor.",
            price: "₹1,500 / month",
            classes: "8 classes a month included",
            subscribers: "15 subscribers · brings in ₹21,600 a month",
            olderPrices: ["3 still on ₹1,200 — they keep it"],
            archived: false,
            draft: false,
            unpublished: false,
            canArchive: true,
        });
    });

    it("says unlimited classes for a plan with no cap", () => {
        expect(planCard(plan({ classesPerMonth: null }), true).classes).toBe(
            "Unlimited classes",
        );
    });

    it("says nothing about classes where the business sells none", () => {
        expect(planCard(plan(), false).classes).toBeNull();
    });

    it("says a plan nobody is on has no subscribers yet", () => {
        const card = planCard(
            plan({ subscriberCount: 0, byPrice: [], monthlyFromMembers: "0" }),
            false,
        );
        expect(card.subscribers).toBe("No subscribers yet");
        expect(card.olderPrices).toEqual([]);
    });

    it("says when everyone on it is paused", () => {
        expect(
            planCard(
                plan({ subscriberCount: 1, monthlyFromMembers: "0.00" }),
                false,
            ).subscribers,
        ).toBe("1 subscriber · none paying right now");
    });

    it("rounds what it brings in to the rupee", () => {
        expect(
            planCard(plan({ monthlyFromMembers: "1516.67" }), false)
                .subscribers,
        ).toBe("15 subscribers · brings in ₹1,517 a month");
    });

    it("says a yearly plan's price per year", () => {
        expect(
            planCard(plan({ price: "12000.00", interval: "YEAR" }), false)
                .price,
        ).toBe("₹12,000 / year");
    });

    it("marks an archived plan, which can be sold again", () => {
        const card = planCard(plan({ status: "ARCHIVED" }), false);
        expect(card.archived).toBe(true);
        expect(card.canArchive).toBe(true);
    });

    it("badges a draft, which has nothing to archive", () => {
        const card = planCard(
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
            planCard(plan({ pendingChangedAt: "2026-09-20T00:00:00Z" }), false)
                .unpublished,
        ).toBe(true);
        expect(
            planCard(plan({ pendingChangedAt: null }), false).unpublished,
        ).toBe(false);
    });
});

describe("plansOnTab", () => {
    it("counts every plan not archived, drafts included", () => {
        expect(
            plansOnTab([
                { status: "ACTIVE" },
                { status: "DRAFT" },
                { status: "ARCHIVED" },
            ]),
        ).toBe(2);
        expect(plansOnTab([])).toBe(0);
    });
});

describe("archiveToast", () => {
    it("says who carries on when a plan is archived", () => {
        expect(
            archiveToast({ name: "Drop-in", subscriberCount: 4 }, true),
        ).toBe(
            "Drop-in archived. Its 4 subscribers carry on; nobody new can join.",
        );
        expect(
            archiveToast({ name: "Drop-in", subscriberCount: 1 }, true),
        ).toBe(
            "Drop-in archived. Its 1 subscriber carries on; nobody new can join.",
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
