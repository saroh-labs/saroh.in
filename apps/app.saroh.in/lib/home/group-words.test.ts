import { describe, expect, it } from "vitest";

import { pinClock } from "@/lib/format/test-clock";

import {
    groupLine,
    groupsCountLabel,
    groupTag,
    onItsWayLabel,
    phoneGroupName,
    phoneGroupTag,
    phoneGroupTitle,
} from "./group-words";
import type { HomeNeed, HomeNeedGroup } from "./service";

pinClock("2026-10-19T09:00:00.000Z");
const NOW = new Date("2026-10-19T09:00:00.000Z");

function row(over: Partial<HomeNeed> = {}): HomeNeed {
    return {
        id: "r1",
        code: "COMMERCE_OPEN_ORDERS",
        severity: "OVERDUE",
        title: "Send order #1057 to Aditya Shetty",
        sub: null,
        amountMinor: null,
        currency: null,
        amountIn: null,
        tag: null,
        tone: "info",
        href: "/commerce/orders/1",
        ...over,
    };
}

function group(over: Partial<HomeNeedGroup>): HomeNeedGroup {
    return {
        kind: "ORDERS",
        count: 1,
        late: 0,
        totals: null,
        oldest: null,
        rows: [],
        more: 0,
        href: "/commerce/orders",
        codes: [],
        ...over,
    };
}

describe("a group's line (board `HAPageD`)", () => {
    it("says the orders, their oldest and how many are late", () => {
        const line = groupLine(
            group({
                count: 7,
                late: 3,
                oldest: {
                    id: "o",
                    title: "#1057",
                    who: "Aditya Shetty",
                    at: "2026-09-23T10:00:00.000Z",
                    amountMinor: 102_000,
                    currency: "INR",
                },
            }),
            NOW,
        );
        expect(line).toEqual({
            title: "7 orders to send or hand over",
            sub: "Oldest placed 23 Sep · Aditya Shetty, ₹1,020",
            tag: { label: "3 late", tone: "bad" },
        });
    });

    it("leaves the oldest amount out for a role without money (`HAMemberD`)", () => {
        const line = groupLine(
            group({
                count: 7,
                oldest: {
                    id: "o",
                    title: "#1057",
                    who: "Aditya Shetty",
                    at: "2026-09-23T10:00:00.000Z",
                    amountMinor: null,
                    currency: null,
                },
            }),
            NOW,
        );
        expect(line.sub).toBe("Oldest placed 23 Sep · Aditya Shetty");
    });

    it("says the bills with their money first, and the oldest", () => {
        const line = groupLine(
            group({
                kind: "BILLS",
                count: 10,
                late: 10,
                all: 16,
                totals: [{ currency: "INR", amountMinor: 3_297_000 }],
                oldest: {
                    id: "i",
                    title: "INV-1",
                    who: "Shruti Menon",
                    at: "2026-09-20T09:00:00.000Z",
                    amountMinor: 1_125_000,
                    currency: "INR",
                },
                href: "/billing/invoices?view=overdue",
            }),
            NOW,
        );
        expect(line).toEqual({
            title: "₹32,970 unpaid on 16 bills",
            sub: "10 overdue · the oldest is Shruti Menon's ₹11,250, 29 days",
            tag: { label: "10 overdue", tone: "bad" },
        });
    });

    it("says the bills by count without money", () => {
        expect(
            groupLine(group({ kind: "BILLS", count: 2, all: 3 }), NOW).title,
        ).toBe("3 unpaid bills");
    });

    it("lists the first rows under the others", () => {
        const line = groupLine(
            group({
                kind: "ENQUIRIES",
                count: 3,
                late: 1,
                rows: [
                    row({ title: "Wedding cake for 120 people" }),
                    row({ id: "r2", title: "Bulk bread for a café" }),
                    row({ id: "r3", title: "Class gift card" }),
                ],
            }),
            NOW,
        );
        expect(line).toEqual({
            title: "3 enquiries to answer",
            sub: "Wedding cake for 120 people · Bulk bread for a café",
            tag: { label: "1 waiting", tone: "due" },
        });
    });

    it("names one of a kind in the singular", () => {
        expect(groupLine(group({ kind: "REVIEWS", count: 1 }), NOW).title).toBe(
            "1 review to reply to",
        );
        expect(
            groupLine(group({ kind: "AWAITING_PAYMENT", count: 2 }), NOW).title,
        ).toBe("2 bookings awaiting payment");
    });

    it("says what a payments group holds, part by part", () => {
        const line = groupLine(
            group({
                kind: "PAYMENTS",
                count: 2,
                rows: [
                    row({ code: "PAYMENTS_FAILED_RENEWALS" }),
                    row({ id: "r2", code: "PAYMENTS_REFUNDS_OWED" }),
                ],
            }),
            NOW,
        );
        expect(line.title).toBe(
            "1 payment didn't go through, 1 refund to make",
        );
        // With rows it can't see, the group's own count.
        expect(
            groupLine(
                group({
                    kind: "PAYMENTS",
                    count: 9,
                    more: 4,
                    rows: [row({ code: "PAYMENTS_FAILED_RENEWALS" })],
                }),
                NOW,
            ).title,
        ).toBe("9 payments to sort out");
    });

    it("says low stock as running low", () => {
        expect(
            groupLine(
                group({
                    kind: "STOCK",
                    count: 2,
                    codes: ["COMMERCE_STOCK_LOW"],
                }),
                NOW,
            ).title,
        ).toBe("2 products running low");
    });

    it("tags today's orders when none is late (`HAMondayD`)", () => {
        expect(groupTag(group({ count: 12 }), 5)).toEqual({
            label: "5 due today",
            tone: "due",
        });
        expect(groupTag(group({ count: 12 }), 0)).toBeNull();
    });
});

describe("the count beside Needs you", () => {
    it("is the sum of the groups, and says when a part is missing", () => {
        expect(groupsCountLabel(24, false)).toBe("24 things");
        expect(groupsCountLabel(7, true)).toBe("7 things we could check");
        expect(groupsCountLabel(0, false)).toBe("");
    });

    it("says the orders on their way", () => {
        expect(onItsWayLabel(1)).toBe("and 1 order on its way");
        expect(onItsWayLabel(3)).toBe("and 3 orders on their way");
        expect(onItsWayLabel(0)).toBe("");
    });
});

describe("a group's line on a phone (U17, boards `HPHome`, `HPSheets`)", () => {
    it("says each group as the thing to do", () => {
        expect(phoneGroupTitle(group({ count: 7 }))).toBe(
            "Pack or hand over 7 orders",
        );
        expect(
            phoneGroupTitle(
                group({
                    kind: "BILLS",
                    count: 10,
                    all: 16,
                    totals: [{ currency: "INR", amountMinor: 3_297_000 }],
                }),
            ),
        ).toBe("₹32,970 unpaid · 16 bills");
        expect(phoneGroupTitle(group({ kind: "ENQUIRIES", count: 3 }))).toBe(
            "Answer 3 enquiries",
        );
        expect(phoneGroupTitle(group({ kind: "REVIEWS", count: 1 }))).toBe(
            "Reply to 1 review",
        );
        expect(
            phoneGroupTitle(group({ kind: "AWAITING_PAYMENT", count: 2 })),
        ).toBe("2 bookings awaiting payment");
        expect(
            phoneGroupTitle(
                group({
                    kind: "STOCK",
                    count: 2,
                    codes: ["COMMERCE_STOCK_LOW"],
                }),
            ),
        ).toBe("2 products running low");
    });

    it("says bills without money as a count, for a role without it", () => {
        expect(
            phoneGroupTitle(
                group({ kind: "BILLS", count: 10, all: 16, totals: null }),
            ),
        ).toBe("16 unpaid bills");
    });

    it("says a payments group part by part when every row is here", () => {
        expect(
            phoneGroupTitle(
                group({
                    kind: "PAYMENTS",
                    count: 2,
                    rows: [
                        row({ id: "a", code: "PAYMENTS_FAILED_RENEWALS" }),
                        row({ id: "b", code: "PAYMENTS_REFUNDS_OWED" }),
                    ],
                }),
            ),
        ).toBe("1 payment failed · 1 refund to make");
        expect(
            phoneGroupTitle(group({ kind: "PAYMENTS", count: 4, more: 3 })),
        ).toBe("4 payments to sort out");
    });

    it("tags late, due today and how long an enquiry has waited", () => {
        expect(phoneGroupTag(group({ count: 7, late: 3 }), NOW)).toEqual({
            label: "3 late",
            tone: "bad",
        });
        expect(phoneGroupTag(group({ count: 12 }), NOW, 5)).toEqual({
            label: "5 due today",
            tone: "due",
        });
        const enquiry = (late: number) =>
            group({
                kind: "ENQUIRIES",
                count: 3,
                late,
                oldest: {
                    id: "e",
                    title: "Wedding cake",
                    who: "Rohan Kapoor",
                    at: "2026-10-17T09:00:00.000Z",
                    amountMinor: null,
                    currency: null,
                },
            });
        expect(phoneGroupTag(enquiry(1), NOW)?.label).toBe("1 waiting 2 days");
        expect(phoneGroupTag(enquiry(2), NOW)?.label).toBe(
            "2 waiting up to 2 days",
        );
        expect(phoneGroupTag(enquiry(0), NOW)).toBeNull();
    });

    it("names folded groups for Show N more", () => {
        expect(phoneGroupName({ kind: "REVIEWS", count: 1 })).toBe("review");
        expect(phoneGroupName({ kind: "STOCK", count: 3 })).toBe("low stock");
    });
});
