import { describe, expect, it } from "vitest";

import type { AnalyticsSummary } from "@/lib/analytics/summary";

import {
    fromAnswer,
    moneyAnswer,
    moneyChart,
    niceCeiling,
    partialWords,
    sellsAnswer,
    sellsRows,
    sourceLine,
    thinBars,
} from "./overview-words";
import { periodWindow } from "./period";
import type { MoneyRead, SellsRead } from "./reads";

/**
 * The Overview's words (DEC-171, #1089), pinned to the boards' sentences:
 * `IBOverviewD` (4 weeks, up), `IBPeriodD` (7 days, a bar a day), `IBThinD`
 * (first weeks), `IBNoSalesD`, `IBMemberD` (counts only) and `IBFailedD`.
 */

const WEEKS = [
    "2026-07-27",
    "2026-08-03",
    "2026-08-10",
    "2026-08-17",
    "2026-08-24",
    "2026-08-31",
    "2026-09-07",
    "2026-09-14",
    "2026-09-21",
    "2026-09-28",
    "2026-10-05",
    "2026-10-12",
];
const TAKEN = [38, 41, 36, 44, 40, 43, 45, 41, 44, 47, 43, 50];

function sunday(monday: string): string {
    const at = new Date(`${monday}T00:00:00.000Z`);
    at.setUTCDate(at.getUTCDate() + 6);
    return at.toISOString().slice(0, 10);
}

function money(over: Partial<MoneyRead> = {}): MoneyRead {
    return {
        period: "4w",
        zone: "Asia/Kolkata",
        currency: "INR",
        otherCurrencies: [],
        window: periodWindow("4w", "2026-10-19"),
        startedOn: "2025-01-06",
        ageDays: 651,
        thin: false,
        hasSales: true,
        firstSaleOn: "2025-01-10",
        moneyIn: {
            amountMinor: 18_460_000,
            beforeMinor: 16_930_000,
            change: { kind: "UP", percent: 9 },
            payments: 288,
            paymentsBefore: 270,
            orders: 271,
            ordersBefore: 255,
            bills: 17,
            billsBefore: 15,
        },
        bestWeek: {
            start: "2026-10-12",
            end: "2026-10-18",
            takingsMinor: 5_000_000,
        },
        weeks: WEEKS.map((start, i) => ({
            start,
            end: sunday(start),
            takingsMinor: (TAKEN[i] ?? 0) * 100_000,
            orders: 60,
            payments: 64,
            in: i >= 8 ? "PERIOD" : i >= 4 ? "BEFORE" : null,
        })),
        ...over,
    };
}

function sells(over: Partial<SellsRead> = {}): SellsRead {
    return {
        period: "4w",
        zone: "Asia/Kolkata",
        currency: "INR",
        window: periodWindow("4w", "2026-10-19"),
        ageDays: 651,
        thin: false,
        money: true,
        bestSellers: {
            rows: [
                {
                    productId: "p1",
                    name: "Sourdough loaf",
                    sold: 412,
                    soldBefore: 400,
                    amountMinor: 7_416_000,
                    isNew: false,
                },
                {
                    productId: "p2",
                    name: "Seeded multigrain loaf",
                    sold: 236,
                    soldBefore: 220,
                    amountMinor: 4_720_000,
                    isNew: false,
                },
                {
                    productId: "p3",
                    name: "Croissants, box of 4",
                    sold: 188,
                    soldBefore: 150,
                    amountMinor: 3_384_000,
                    isNew: false,
                },
                {
                    productId: "p4",
                    name: "Rye",
                    sold: 20,
                    soldBefore: 20,
                    amountMinor: 200_000,
                    isNew: false,
                },
            ],
            total: 14,
        },
        booked: {
            rows: [
                {
                    serviceId: "s1",
                    name: "Saturday sourdough class",
                    kind: "CLASS",
                    bookings: 46,
                    people: 40,
                    sessions: 4,
                    fullPercent: 96,
                },
            ],
            total: 1,
            bookings: 46,
            enough: true,
        },
        ...over,
    };
}

describe("Am I making more money?", () => {
    it("says yes, how much more and by how much (IBOverviewD)", () => {
        expect(moneyAnswer(money())).toEqual({
            lead: "Yes.",
            text: "₹1,84,600 came in over the last 4 weeks, ₹15,300 more than the 4 before (up 9%).",
        });
    });

    it("the last 7 days against the 7 before (IBPeriodD)", () => {
        const read = money({
            period: "7d",
            window: periodWindow("7d", "2026-10-19"),
            moneyIn: {
                ...money().moneyIn,
                amountMinor: 4_825_000,
                beforeMinor: 4_308_000,
                change: { kind: "UP", percent: 12 },
            },
        });
        expect(moneyAnswer(read)).toEqual({
            lead: "Yes.",
            text: "₹48,250 came in over the last 7 days, ₹5,170 more than the 7 before (up 12%).",
        });
    });

    it("says no, and never more than 99% down while anything came in", () => {
        const read = money({
            moneyIn: {
                ...money().moneyIn,
                amountMinor: 10_000,
                beforeMinor: 5_000_000,
                change: { kind: "DOWN", percent: 100 },
            },
        });
        expect(moneyAnswer(read)).toEqual({
            lead: "No.",
            text: "₹100 came in over the last 4 weeks, ₹49,900 less than the 4 before (down 99%).",
        });
    });

    it("says nothing came in in words, never ₹0 or 100% below", () => {
        const read = money({
            moneyIn: {
                ...money().moneyIn,
                amountMinor: 0,
                beforeMinor: 400_000,
                change: { kind: "DOWN", percent: 100 },
            },
        });
        const said = moneyAnswer(read);
        expect(said).toEqual({
            lead: "No.",
            text: "Nothing came in over the last 4 weeks, against ₹4,000 in the 4 before.",
        });
        expect(said.text).not.toMatch(/₹0|100%/);
    });

    it("a small change is about the same; three times is said as times", () => {
        const level = money({
            moneyIn: {
                ...money().moneyIn,
                amountMinor: 1_010_000,
                beforeMinor: 1_000_000,
                change: { kind: "UP", percent: 1 },
            },
        });
        expect(moneyAnswer(level)).toEqual({
            lead: "About the same.",
            text: "₹10,100 came in over the last 4 weeks, against ₹10,000 in the 4 before.",
        });
        const times = money({
            moneyIn: {
                ...money().moneyIn,
                amountMinor: 3_000_000,
                beforeMinor: 1_000_000,
                change: { kind: "UP", percent: 200 },
            },
        });
        expect(moneyAnswer(times).text).toContain("(about 3 times as much)");
    });

    it("with too little before, says so rather than a percent", () => {
        const read = money({
            moneyIn: {
                ...money().moneyIn,
                beforeMinor: 10_000,
                change: { kind: "THIN" },
            },
        });
        expect(moneyAnswer(read)).toEqual({
            lead: null,
            text: "₹1,84,600 came in over the last 4 weeks. Too little came in the 4 before to compare.",
        });
    });

    it("in the first weeks: what came in, and when comparing starts (IBThinD)", () => {
        const read = money({
            thin: true,
            startedOn: "2026-09-28",
            ageDays: 21,
            moneyIn: {
                ...money().moneyIn,
                amountMinor: 2_140_000,
                change: { kind: "THIN" },
            },
        });
        expect(moneyAnswer(read)).toEqual({
            lead: null,
            text: "₹21,400 came in over your first 3 weeks on Saroh. There is nothing earlier to compare with yet. Comparing starts after 8 weeks.",
        });
        // Its weeks only, each under its own date.
        expect(thinBars(read).map((b) => b.tick)).toEqual([
            "28 Sep",
            "5 Oct",
            "12 Oct",
        ]);
    });

    it("a young business on the 7 days names the last 7 days, not its life", () => {
        const read = money({
            period: "7d",
            window: periodWindow("7d", "2026-10-19"),
            thin: true,
            startedOn: "2026-10-09",
            ageDays: 10,
        });
        expect(moneyAnswer(read).text).toMatch(
            /^₹1,84,600 came in over the last 7 days\. .*after 2 weeks\.$/,
        );
    });
});

describe("the money card's picture", () => {
    it("draws the twelve weeks by window, the best labelled (IBOverviewD)", () => {
        const chart = moneyChart(money());
        expect(chart.kind).toBe("weeks");
        expect(chart.bars.map((b) => b.tone)).toEqual([
            ...Array<string>(4).fill("old"),
            ...Array<string>(4).fill("before"),
            ...Array<string>(4).fill("now"),
        ]);
        expect(chart.bars.filter((b) => b.best).map((b) => b.key)).toEqual([
            "2026-10-12",
        ]);
        expect(chart.grid).toEqual(["₹50K", "₹25K", "₹0"]);
        expect(chart.bars.filter((b) => b.tick).map((b) => b.tick)).toEqual([
            "27 Jul",
            "24 Aug",
            "21 Sep",
            "12 Oct",
        ]);
        expect(chart.legend.map((l) => l.label)).toEqual([
            "Last 4 weeks",
            "The 4 before",
            "Earlier",
        ]);
        expect(chart.bars.at(-1)?.heightPercent).toBe(100);
        expect(chart.label).toContain("took ₹50,000");
    });

    it("draws the last 7 days a bar a day, an empty day kept (IBPeriodD)", () => {
        const days = [
            "2026-10-13",
            "2026-10-14",
            "2026-10-15",
            "2026-10-16",
            "2026-10-17",
            "2026-10-18",
            "2026-10-19",
        ].map((date, i) => ({
            date,
            amountMinor: i === 1 ? 0 : 500_000,
            payments: 1,
        }));
        const chart = moneyChart(
            money({
                period: "7d",
                window: periodWindow("7d", "2026-10-19"),
                days,
            }),
        );
        expect(chart.kind).toBe("days");
        expect(chart.bars.map((b) => b.tick)).toEqual([
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
            "Sun",
            "Mon",
        ]);
        expect(chart.bars[1]?.heightPercent).toBe(0);
        expect(chart.bars[1]?.label).toBe("Wed 14 Oct, nothing");
        expect(chart.legend).toEqual([]);
    });

    it("rounds the scale up to a figure people read", () => {
        expect(niceCeiling(4_999)).toBe(5_000);
        expect(niceCeiling(5_000_000)).toBe(5_000_000);
        expect(niceCeiling(2_100)).toBe(2_500);
        expect(niceCeiling(0)).toBe(0);
    });
});

describe("What sells, who books?", () => {
    it("names what sells most and the class that is nearly always full", () => {
        expect(sellsAnswer(sells())).toBe(
            "Sourdough loaf sells most. Saturday sourdough class is almost always full.",
        );
        expect(sellsRows(sells())).toEqual([
            {
                key: "p1",
                name: "Sourdough loaf",
                qty: "412 sold",
                amount: "₹74,160",
            },
            {
                key: "p2",
                name: "Seeded multigrain loaf",
                qty: "236 sold",
                amount: "₹47,200",
            },
            {
                key: "p3",
                name: "Croissants, box of 4",
                qty: "188 sold",
                amount: "₹33,840",
            },
        ]);
    });

    it("a role without payments sees counts and no amounts (IBMemberD)", () => {
        const read = sells({
            money: false,
            bestSellers: {
                ...sells().bestSellers,
                rows: sells().bestSellers.rows.map((r) => ({
                    ...r,
                    amountMinor: null,
                })),
            },
        });
        const rows = sellsRows(read);
        expect(rows.map((r) => r.qty)).toEqual([
            "412 sold",
            "236 sold",
            "188 sold",
        ]);
        expect(rows.every((r) => r.amount === null)).toBe(true);
    });

    it("in the first weeks: the leader with its count, bookings when there are enough (IBThinD)", () => {
        const read = sells({
            thin: true,
            bestSellers: {
                rows: [{ ...sells().bestSellers.rows[0], sold: 64 }],
                total: 3,
            },
            booked: {
                ...sells().booked,
                bookings: 3,
                enough: false,
            },
        });
        expect(sellsAnswer(read)).toBe(
            "Sourdough loaf leads with 64 sold. Too few bookings yet to say which class is busiest.",
        );
        expect(sellsRows(read)).toEqual([]);
    });

    it("a business that only takes bookings lists what is booked most", () => {
        const read = sells({
            bestSellers: { rows: [], total: 0 },
            booked: {
                rows: [
                    {
                        serviceId: "s9",
                        name: "Haircut",
                        kind: "ONE_TO_ONE",
                        bookings: 30,
                        people: 28,
                        sessions: null,
                        fullPercent: null,
                    },
                ],
                total: 1,
                bookings: 30,
                enough: true,
            },
        });
        expect(sellsAnswer(read)).toBe("Haircut is booked most.");
        expect(sellsRows(read)).toEqual([
            { key: "s9", name: "Haircut", qty: "30 bookings", amount: null },
        ]);
    });

    it("says nothing was sold or booked in words", () => {
        const read = sells({
            bestSellers: { rows: [], total: 0 },
            booked: { rows: [], total: 0, bookings: 0, enough: false },
        });
        expect(sellsAnswer(read)).toBe(
            "Nothing sold or booked in the last 4 weeks.",
        );
    });
});

describe("Where do customers come from?", () => {
    const summary: AnalyticsSummary = {
        siteViews: 1689,
        uniqueVisitors: 1109,
        enquiries: 23,
        orders: 159,
    };

    it("visits, people, enquiries and online orders (IBOverviewD)", () => {
        expect(fromAnswer(summary, "4w")).toBe(
            "1,689 visits from 1,109 people, 23 enquiries and 159 online orders.",
        );
    });

    it("before the first sale, says no order has come yet (IBNoSalesD)", () => {
        expect(
            fromAnswer(
                { siteViews: 48, uniqueVisitors: 31, enquiries: 0, orders: 0 },
                "4w",
                true,
            ),
        ).toBe("48 visits from 31 people. No orders yet.");
    });

    it("says no visits in words", () => {
        expect(
            fromAnswer(
                { siteViews: 0, uniqueVisitors: 0, enquiries: 0, orders: 0 },
                "7d",
            ),
        ).toBe("No visits to your website in the last 7 days.");
        expect(fromAnswer({ ...summary, enquiries: 0, orders: 0 }, "4w")).toBe(
            "1,689 visits from 1,109 people, no enquiries and no online orders.",
        );
    });
});

describe("what was counted, and what couldn't be read", () => {
    it("names the payments behind the money, and when website orders start", () => {
        expect(sourceLine(money())).toBe(
            "From 288 payments: 271 paid orders and 17 paid invoices, less refunds. Orders on the website are counted from October 2026.",
        );
        const later = money({ window: periodWindow("7d", "2026-12-19") });
        expect(sourceLine(later)).toBe(
            "From 288 payments: 271 paid orders and 17 paid invoices, less refunds.",
        );
    });

    it("one notice: what's missing, then what is complete (IBFailedD)", () => {
        expect(partialWords(["sells"], ["money"])).toEqual({
            things: "what sells",
            so: "Money is complete.",
        });
        expect(partialWords(["website"], ["money", "sells"])).toEqual({
            things: "your website's figures",
            so: "Money and what sells are complete.",
        });
        expect(partialWords(["money", "sells"], ["website"])).toEqual({
            things: "money and what sells",
            so: "Your website's figures are complete.",
        });
    });
});
