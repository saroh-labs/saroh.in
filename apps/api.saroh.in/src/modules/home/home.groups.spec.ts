/**
 * Needs you, grouped by kind (DEC-171, Home plan U1): groups come in the
 * board's order, the header total is the sum of the groups, a group counts
 * what its "N more" rows stand for, late counts never pass the group's own,
 * advice is never a group, and a viewer without `payment:read` gets counts
 * but no amount anywhere.
 */
import { groupNeeds, kindOf } from "./home-groups";
import type { HomeAction, HomeEvidence } from "./home-model";
import { flattenNeeds } from "./home-needs";

const ZONE = "Asia/Kolkata";

function ev(id: string, over: Partial<HomeEvidence> = {}): HomeEvidence {
    return {
        id,
        title: id,
        subtitle: `Person ${id}`,
        at: "2026-10-10T05:00:00.000Z",
        amountMinor: 100_000,
        currency: "INR",
        href: `/x/${id}`,
        ...over,
    };
}

const ORDERS: HomeAction = {
    code: "COMMERCE_OPEN_ORDERS",
    title: "Fulfil 7 orders due by tomorrow",
    href: "/commerce/orders",
    severity: "OVERDUE",
    moduleKey: "COMMERCE",
    count: 7,
    late: 3,
    evidence: [
        ev("o1", {
            at: "2026-09-23T05:00:00.000Z",
            tone: "bad",
            amountMinor: 102_000,
        }),
        ev("o2", { at: "2026-09-26T05:00:00.000Z", tone: "bad" }),
        ev("o3", { at: "2026-09-26T06:00:00.000Z", tone: "bad" }),
        ev("o4", { tone: "due" }),
        ev("o5", { tone: "due" }),
    ],
    moreTone: "due",
};

const BILLS: HomeAction = {
    code: "PAYMENTS_OVERDUE_INVOICES",
    title: "10 invoices overdue",
    href: "/billing/invoices?view=overdue",
    severity: "OVERDUE",
    moduleKey: "PAYMENTS",
    count: 10,
    evidence: [
        ev("i1", {
            at: "2026-09-20T05:00:00.000Z",
            amountMinor: 1_125_000,
            inline: {
                kind: "SEND_REMINDER",
                label: "Send reminder",
                confirm: "c",
                yes: "y",
                done: "d",
                sends: true,
                undoable: true,
                target: "i1",
                person: "Shruti",
            },
        }),
        ev("i2"),
    ],
};

const REVIEWS: HomeAction = {
    code: "COMMERCE_LOW_STAR_REVIEWS",
    title: "1 review",
    href: "/commerce/reviews",
    severity: "OVERDUE",
    count: 1,
    evidence: [ev("r1", { tag: "1 star", amountMinor: null, currency: null })],
};

const SHORT: HomeAction = {
    code: "COMMERCE_STOCK_SHORT",
    title: "3 sizes are short for orders",
    href: "/commerce/stock?show=needs",
    severity: "ATTENTION",
    count: 3,
    evidence: [ev("s1"), ev("s2"), ev("s3")],
    tag: "Blocks orders",
    tone: "bad",
};

const SETUP: HomeAction = {
    code: "WEBSITE_SETUP",
    title: "Publish your site",
    href: "/sites",
    severity: "SETUP",
    moduleKey: "WEBSITE",
};

const ADVICE: HomeAction = {
    code: "INSIGHTS_VIEW",
    title: "Review this week's performance",
    href: "/analytics",
    severity: "SUGGESTION",
};

const ALL = [ADVICE, SETUP, REVIEWS, SHORT, BILLS, ORDERS];

describe("groupNeeds", () => {
    it("groups by kind in the board's order, skipping advice", () => {
        const { needGroups } = groupNeeds(ALL, ZONE, { money: true });
        expect(needGroups.map((g) => g.kind)).toEqual([
            "ORDERS",
            "BILLS",
            "REVIEWS",
            "STOCK",
            "SETUP",
        ]);
    });

    it("makes the header total the sum of the groups, and the flat list's", () => {
        const { needGroups, needGroupsTotal } = groupNeeds(ALL, ZONE, {
            money: true,
        });
        expect(needGroupsTotal).toBe(
            needGroups.reduce((n, g) => n + g.count, 0),
        );
        // 7 orders + 10 bills + 1 review + 1 short-stock row + 1 setup.
        expect(needGroupsTotal).toBe(20);
        // The same things the flat list counts, so the two never disagree.
        expect(needGroupsTotal).toBe(flattenNeeds(ALL, ZONE).needsTotal);
    });

    it("counts what a group's rows stand for, and says how many more", () => {
        const { needGroups } = groupNeeds(ALL, ZONE, { money: true });
        const orders = needGroups.find((g) => g.kind === "ORDERS");
        expect(orders).toMatchObject({ count: 7, late: 3, more: 2 });
        expect(orders?.rows).toHaveLength(5);
        // "3 more" rows stay off the group's rows: `more` says it.
        expect(orders?.rows.some((r) => r.id.endsWith(":more"))).toBe(false);
        const bills = needGroups.find((g) => g.kind === "BILLS");
        expect(bills).toMatchObject({ count: 10, late: 10, more: 8 });
    });

    it("never counts more late than a group holds", () => {
        const { needGroups } = groupNeeds([SHORT], ZONE, { money: true });
        // One row for three shelves: one thing, and it blocks orders.
        expect(needGroups[0]).toMatchObject({
            kind: "STOCK",
            count: 1,
            late: 1,
        });
    });

    it("names the oldest thing with its money", () => {
        const { needGroups } = groupNeeds([ORDERS], ZONE, { money: true });
        expect(needGroups[0].oldest).toEqual({
            id: "o1",
            title: "o1",
            who: "Person o1",
            at: "2026-09-23T05:00:00.000Z",
            amountMinor: 102_000,
            currency: "INR",
        });
    });

    it("keeps each row's inline action and link", () => {
        const { needGroups } = groupNeeds([BILLS], ZONE, { money: true });
        const row = needGroups[0].rows[0];
        expect(row.inline?.kind).toBe("SEND_REMINDER");
        expect(row.href).toBe("/x/i1");
        expect(row).toMatchObject({ amountMinor: 1_125_000, currency: "INR" });
    });

    it("carries the bills' unpaid total and every unpaid bill", () => {
        const totals = [{ currency: "INR", amountMinor: 3_297_000 }];
        const { needGroups } = groupNeeds([BILLS], ZONE, {
            money: true,
            extra: { bills: { totals, all: 16 } },
        });
        expect(needGroups[0]).toMatchObject({ all: 16, totals });
    });

    it("gives a viewer without payment:read counts and no amounts", () => {
        const refund: HomeAction = {
            code: "PAYMENTS_REFUNDS_OWED",
            title: "1 payment to refund",
            href: "/billing/invoices",
            severity: "ATTENTION",
            count: 1,
            evidence: [
                ev("p1", {
                    inline: {
                        kind: "REFUND",
                        label: "Refund",
                        confirm: "₹500 goes back",
                        yes: "Refund ₹500",
                        done: "d",
                        sends: false,
                        undoable: false,
                        target: "p1",
                        person: null,
                    },
                }),
            ],
        };
        const { needGroups, needGroupsTotal } = groupNeeds(
            [ORDERS, BILLS, refund],
            ZONE,
            {
                money: false,
                extra: {
                    bills: {
                        totals: [{ currency: "INR", amountMinor: 1 }],
                        all: 16,
                    },
                },
            },
        );
        expect(needGroupsTotal).toBe(18);
        for (const group of needGroups) {
            expect(group.totals).toBeNull();
            expect(group.oldest?.amountMinor ?? null).toBeNull();
            for (const row of group.rows) {
                expect(row.amountMinor).toBeNull();
                expect(row.currency).toBeNull();
                expect(row.amountIn).toBeNull();
                // Its words name the amount, so the action goes with it.
                expect(row.inline?.kind).not.toBe("REFUND");
            }
        }
        // The count of bills still comes.
        expect(needGroups.find((g) => g.kind === "BILLS")?.all).toBe(16);
    });

    it("leaves out a group whose source failed (sent nothing)", () => {
        const { needGroups } = groupNeeds([ORDERS], ZONE, { money: true });
        expect(needGroups.map((g) => g.kind)).toEqual(["ORDERS"]);
    });

    it("puts each source in its group", () => {
        expect(
            kindOf({
                code: "APPOINTMENTS_AWAITING_PAYMENT",
                severity: "OVERDUE",
            }),
        ).toBe("AWAITING_PAYMENT");
        expect(
            kindOf({ code: "CRM_UNANSWERED_MESSAGES", severity: "OVERDUE" }),
        ).toBe("ENQUIRIES");
        expect(
            kindOf({ code: "PAYMENTS_FAILED_RENEWALS", severity: "OVERDUE" }),
        ).toBe("PAYMENTS");
        expect(
            kindOf({ code: "COMMERCE_STOCK_LOW", severity: "SUGGESTION" }),
        ).toBe("STOCK");
        expect(
            kindOf({
                code: "PAYMENTS_BUSINESS_DETAILS",
                severity: "ATTENTION",
            }),
        ).toBe("SETUP");
        expect(
            kindOf({
                code: "COMMERCE_SUGGEST_PRODUCT",
                severity: "SUGGESTION",
            }),
        ).toBeNull();
    });
});
