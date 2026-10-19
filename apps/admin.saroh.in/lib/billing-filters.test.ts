import { describe, expect, it } from "vitest";

import {
    activeCard,
    cardHref,
    clearHref,
    isNarrowed,
    planHref,
    searchHref,
    tabHref,
    tabOf,
    withFilter,
} from "./billing-filters";

const SUBS = "/billing/subscriptions";

describe("billing filters as addresses", () => {
    it("knows the tab from the path, Subscriptions for /billing", () => {
        expect(tabOf("/billing/invoices")).toBe("invoices");
        expect(tabOf("/billing/actions")).toBe("actions");
        expect(tabOf("/billing/events")).toBe("events");
        expect(tabOf("/billing/subscriptions")).toBe("subscriptions");
        expect(tabOf("/billing")).toBe("subscriptions");
    });

    it("a change of filter goes back to page one and closes the sheet", () => {
        expect(
            withFilter(
                SUBS,
                { plan: "grow", page: "3", open: "s1" },
                {
                    status: "ACTIVE",
                },
            ),
        ).toBe(`${SUBS}?plan=grow&status=ACTIVE`);
    });

    it("a status card sets its filter, replacing another card's", () => {
        expect(cardHref(SUBS, {}, "paying")).toBe(`${SUBS}?status=ACTIVE`);
        expect(cardHref(SUBS, { status: "ACTIVE" }, "ending")).toBe(
            `${SUBS}?view=ending-soon`,
        );
        expect(cardHref(SUBS, { view: "ending-soon" }, "ended")).toBe(
            `${SUBS}?status=CANCELLED`,
        );
    });

    it("a status card pressed again takes its filter off, keeping the rest", () => {
        expect(
            cardHref(
                SUBS,
                { status: "PAST_DUE", plan: "grow", q: "rye" },
                "failed",
            ),
        ).toBe(`${SUBS}?plan=grow&q=rye`);
        expect(cardHref(SUBS, { view: "ending-soon" }, "ending")).toBe(SUBS);
    });

    it("reads the card that is on, older view links included", () => {
        expect(activeCard({ status: "TRIALING" })).toBe("trial");
        expect(activeCard({ view: "ending-soon" })).toBe("ending");
        expect(activeCard({ view: "past-due" })).toBe("failed");
        expect(activeCard({ view: "first-month" })).toBe("trial");
        expect(activeCard({})).toBeUndefined();
    });

    it("plan and search combine, each keeping the other", () => {
        const planned = planHref(SUBS, { q: "pay_Abc123" }, "grow");
        expect(planned).toBe(`${SUBS}?q=pay_Abc123&plan=grow`);
        expect(searchHref(SUBS, { plan: "grow", page: "2" }, " rye ")).toBe(
            `${SUBS}?plan=grow&q=rye`,
        );
        // The same chip again: every plan, the search kept.
        expect(planHref(SUBS, { q: "rye", plan: "grow" }, "grow")).toBe(
            `${SUBS}?q=rye`,
        );
    });

    it("an empty search takes the term off", () => {
        expect(searchHref(SUBS, { q: "rye", plan: "grow" }, "")).toBe(
            `${SUBS}?plan=grow`,
        );
    });

    it("a tab carries the search and nothing else", () => {
        expect(tabHref("invoices", { q: "sub_Abc123", plan: "grow" })).toBe(
            "/billing/invoices?q=sub_Abc123",
        );
        expect(tabHref("events", {})).toBe("/billing/events");
    });

    it("knows when a tab is narrowed, and how to clear it", () => {
        expect(isNarrowed("invoices", { month: "2026-10" })).toBe(true);
        // Invoices' own status (R29); a Subscriptions-only key isn't one.
        expect(isNarrowed("invoices", { status: "unpaid" })).toBe(true);
        expect(isNarrowed("invoices", { view: "ending-soon" })).toBe(false);
        expect(isNarrowed("subscriptions", { q: "rye" })).toBe(true);
        expect(isNarrowed("actions", { page: "2" })).toBe(false);
        expect(clearHref("actions")).toBe("/billing/actions");
    });
});
