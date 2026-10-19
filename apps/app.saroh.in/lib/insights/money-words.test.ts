import { describe, expect, it } from "vitest";

import {
    lastSevenDays,
    moneyTabAnswer,
    moneyTiles,
    moneyWeekBars,
    otherCurrencyNote,
    owedView,
    placesView,
    shares,
    weekReadout,
    weekSheetWords,
} from "./money-words";
import { moneyRead, rollingWeeks } from "./money.fixture";
import { barName, tickIndexes } from "./overview-words";

/** `n` of the same value, typed. */
function times<T>(n: number, value: T): T[] {
    return Array.from({ length: n }, () => value);
}

/**
 * The Money tab's words (DEC-171, plan U12, #1093; `IBMoneyD`, `IBWeekD`,
 * `IBOwedD`): the answer and its best week, the four figures and where
 * each opens, the last 7 days, where the money comes from (no place at
 * 0%), who owes by how late, the week's sheet, and the other-currency
 * note. Every period's bars, and a young business that can't compare yet.
 */

describe("Money: am I making more money?", () => {
    it("answers, leaves the percentage to the figure, and names the best week", () => {
        expect(moneyTabAnswer(moneyRead())).toEqual({
            lead: "Yes.",
            text: "₹1,84,600 came in over the last 4 weeks, ₹15,300 more than the 4 before. Your best week was the week of 13 Oct, at ₹50,100.",
        });
    });

    it("in the first weeks says what came in and that there's nothing to compare yet", () => {
        const read = moneyRead({ thin: true, ageDays: 20 });
        const answer = moneyTabAnswer(read);
        expect(answer.lead).toBeNull();
        expect(answer.text).toContain("nothing earlier to compare with yet");
        expect(answer.text).not.toContain("best week");
    });

    it("reads each bar as its week, its money and its payments", () => {
        const { bars, initial } = moneyWeekBars(moneyRead());
        expect(bars).toHaveLength(12);
        expect(initial).toBe("2026-10-13");
        expect(bars.at(-1)?.readout).toBe(
            "Week of 13 Oct · ₹50,100 · 64 payments",
        );
        expect(bars.at(-1)?.best).toBe(true);
        expect(bars.map((b) => b.tone)).toEqual([
            ...times(4, "old"),
            ...times(4, "before"),
            ...times(4, "now"),
        ]);
        const empty = rollingWeeks("2026-10-19", [0], ["PERIOD"])[0];
        expect(weekReadout(empty, "INR")).toBe(
            "Week of 13 Oct · nothing came in",
        );
    });

    it("names a 3-month window's longer first bar by its days", () => {
        expect(
            barName({ start: "2026-07-20", end: "2026-07-27", days: 8 }),
        ).toBe("20 to 27 Jul");
        expect(barName({ start: "2026-07-28", end: "2026-08-03" })).toBe(
            "Week of 28 Jul",
        );
        // Four dates under 26 bars, as under 12.
        expect(Array.from(tickIndexes(26))).toEqual([0, 9, 17, 25]);
        expect(Array.from(tickIndexes(12))).toEqual([0, 4, 8, 11]);
    });

    it("draws 7 days, 4 weeks and 3 months as their own bars", () => {
        const seven = moneyRead(
            {
                weeks: rollingWeeks("2026-10-19", times(12, 100_000), [
                    ...times(10, null),
                    "BEFORE",
                    "PERIOD",
                ]),
            },
            "7d",
        );
        expect(moneyWeekBars(seven).chart.legend.map((l) => l.label)).toEqual([
            "Last 7 days",
            "The 7 before",
            "Earlier",
        ]);

        const months = moneyRead(
            {
                weeks: rollingWeeks("2026-10-19", times(26, 100_000), [
                    ...times<"BEFORE">(13, "BEFORE"),
                    ...times<"PERIOD">(13, "PERIOD"),
                ]),
            },
            "3m",
        );
        const { bars, chart } = moneyWeekBars(months);
        expect(bars).toHaveLength(26);
        expect(chart.legend.map((l) => l.label)).toEqual([
            "Last 3 months",
            "The 3 months before",
        ]);
        expect(bars.filter((b) => b.tick)).toHaveLength(4);
    });
});

describe("Money: the four figures", () => {
    it("says each against the period before and opens the rows it counts", () => {
        const period =
            "/commerce/orders?date=custom&from=2026-09-22&to=2026-10-19&payment=paid";
        expect(moneyTiles(moneyRead())).toEqual([
            {
                key: "in",
                label: "Money in",
                value: "₹1,84,600",
                sub: "Up 9% on the 4 weeks before",
                tone: "up",
                href: period,
            },
            {
                key: "payments",
                label: "Paid orders and bills",
                value: "288",
                sub: "21 more than the 4 weeks before",
                tone: "up",
                href: period,
            },
            {
                key: "usual",
                label: "An order is usually",
                value: "₹640",
                sub: "About the same as before",
                tone: null,
                href: period,
            },
            {
                key: "best",
                label: "Best week",
                value: "13 Oct",
                sub: "₹50,100, the most in 12 weeks",
                tone: null,
                href: "/commerce/orders?date=custom&from=2026-10-13&to=2026-10-19&payment=paid",
            },
        ]);
    });

    it("says a fall in red, zero in words, and no comparison for a young business", () => {
        const down = moneyTiles(
            moneyRead({
                moneyIn: {
                    ...moneyRead().moneyIn,
                    amountMinor: 0,
                    change: { kind: "THIN" },
                    payments: 0,
                },
                usualOrder: {
                    amountMinor: null,
                    beforeMinor: 63_500,
                    orders: 0,
                    ordersBefore: 255,
                },
            }),
        );
        expect(down[0]).toMatchObject({
            value: "Nothing",
            sub: "Down from ₹1,69,300 in the 4 weeks before",
            tone: "bad",
        });
        expect(down[2]).toMatchObject({
            value: "None",
            sub: "No paid orders in the last 4 weeks",
        });

        const young = moneyTiles(moneyRead({ thin: true }));
        expect(young[0].sub).toBe("Nothing earlier to compare with yet");
        expect(young[1].sub).toBe("Nothing earlier to compare with yet");
        expect(young.every((t) => t.tone !== "bad")).toBe(true);
    });

    it("says the usual order's move only when it's more than about the same", () => {
        const tile = (beforeMinor: number) =>
            moneyTiles(
                moneyRead({
                    usualOrder: {
                        amountMinor: 64_000,
                        beforeMinor,
                        orders: 10,
                        ordersBefore: 10,
                    },
                }),
            )[2];
        expect(tile(50_000)).toMatchObject({ sub: "Up from ₹500", tone: "up" });
        expect(tile(80_000)).toMatchObject({ sub: "Down from ₹800" });
    });
});

describe("Money: how were the last 7 days", () => {
    it("sets the newest bar against the one before and names the best day", () => {
        expect(lastSevenDays(moneyRead())).toEqual({
            text: "₹50,100 from 13 to 19 Oct, up 17% on the 7 days before. Saturday brought in the most, ₹11,900.",
            href: "/commerce/orders?date=custom&from=2026-10-13&to=2026-10-19&payment=paid",
        });
    });

    it("says nothing came in, in words, never ₹0", () => {
        const weeks = rollingWeeks(
            "2026-10-19",
            [400_000, 0],
            ["BEFORE", "PERIOD"],
        );
        expect(lastSevenDays(moneyRead({ weeks, days: [] }))?.text).toBe(
            "Nothing came in from 13 to 19 Oct, against ₹4,000 the 7 days before.",
        );
    });

    it("never says a percentage on too little before", () => {
        const weeks = rollingWeeks(
            "2026-10-19",
            [400_000, 900_000],
            ["BEFORE", "PERIOD"],
        );
        weeks[0].payments = 2;
        expect(lastSevenDays(moneyRead({ weeks, days: [] }))?.text).toBe(
            "₹9,000 from 13 to 19 Oct. Too little came in the 7 days before to compare.",
        );
    });
});

describe("Money: where the money comes from", () => {
    it("says the largest share and what grew most, in rupees, each opening its rows", () => {
        const view = placesView(moneyRead());
        expect(view?.text).toBe(
            "More than half comes in at Hill Road. Online orders grew the most, up 18%.",
        );
        expect(view?.places).toEqual([
            {
                key: "location:hill",
                name: "Hill Road",
                amount: "₹1,07,070",
                percent: 58,
                href: "/commerce/orders?storefront=hill&date=custom&from=2026-09-22&to=2026-10-19&payment=paid",
            },
            {
                key: "online",
                name: "Online",
                amount: "₹62,760",
                percent: 34,
                href: "/commerce/orders?date=custom&from=2026-09-22&to=2026-10-19&payment=paid",
            },
            {
                key: "invoices",
                name: "Invoices",
                amount: "₹14,770",
                percent: 8,
                href: "/billing/invoices?tab=paid",
            },
        ]);
    });

    it("leaves out a place under 1%, never says 0%", () => {
        const read = moneyRead({
            places: [
                {
                    key: "location:hill",
                    kind: "LOCATION",
                    name: "Hill Road",
                    amountMinor: 99_900_000,
                    beforeMinor: 0,
                    change: { kind: "THIN" },
                },
                {
                    key: "online",
                    kind: "ONLINE",
                    name: null,
                    amountMinor: 10_000,
                    beforeMinor: 0,
                    change: { kind: "THIN" },
                },
            ],
        });
        const view = placesView(read);
        expect(view?.places.map((p) => p.name)).toEqual(["Hill Road"]);
        expect(view?.label).not.toMatch(/\b0 per cent/);
    });

    it("says all of it for one place, and nothing for no money", () => {
        const one = moneyRead({ places: moneyRead().places?.slice(0, 1) });
        expect(placesView(one)?.text).toBe("All of it came in at Hill Road.");
        expect(placesView(moneyRead({ places: [] }))).toBeNull();
        expect(shares([1, 1, 1])).toEqual([34, 33, 33]);
    });
});

describe("Money: who owes me", () => {
    it("says what is owed, how much is more than a month late, and each age", () => {
        const view = owedView(moneyRead());
        expect(view?.text).toBe(
            "₹32,970 on 16 bills. ₹12,530 of it is more than a month late.",
        );
        expect(view?.rows).toEqual([
            {
                age: "notDue",
                label: "Not due yet",
                amount: "₹6,400",
                bills: "6 bills",
                count: 6,
                percent: 19,
                href: "/billing/invoices?view=issued",
            },
            {
                age: "late1to30",
                label: "1 to 30 days late",
                amount: "₹14,040",
                bills: "8 bills",
                count: 8,
                percent: 43,
                href: "/billing/invoices?view=overdue",
            },
            {
                age: "lateOver30",
                label: "More than 30 days late",
                amount: "₹12,530",
                bills: "2 bills",
                count: 2,
                percent: 38,
                href: "/billing/invoices?view=overdue",
            },
        ]);
    });

    it("never draws a shop that has never billed, nor a role without invoices", () => {
        expect(owedView(moneyRead({ owed: null }))).toBeNull();
        expect(owedView(moneyRead({ owed: undefined }))).toBeNull();
    });

    it("says nobody owes anything, and counts when amounts aren't sent", () => {
        const owed = moneyRead().owed;
        if (!owed) throw new Error("fixture");
        const none = {
            ...owed,
            totals: [],
            bills: 0,
            overdue: 0,
            byAge: {
                notDue: { ...owed.byAge.notDue, count: 0, totals: [] },
                late1to30: { ...owed.byAge.late1to30, count: 0, totals: [] },
                lateOver30: { ...owed.byAge.lateOver30, count: 0, totals: [] },
            },
        };
        expect(owedView(moneyRead({ owed: none }))?.text).toBe(
            "Nobody owes you anything right now.",
        );
        const counts = {
            ...owed,
            totals: null,
            byAge: {
                notDue: { ...owed.byAge.notDue, totals: null },
                late1to30: { ...owed.byAge.late1to30, totals: null },
                lateOver30: { ...owed.byAge.lateOver30, totals: null },
            },
        };
        const view = owedView(moneyRead({ owed: counts }));
        expect(view?.text).toBe(
            "16 bills not paid yet. 2 bills are more than a month late.",
        );
        expect(view?.rows.every((r) => r.amount === null)).toBe(true);
        expect(view?.text).not.toContain("₹");
    });
});

describe("Money: a week's sheet and the other currency", () => {
    it("says the week, its payments and whether it was the best", () => {
        const read = moneyRead();
        expect(weekSheetWords(read.weeks[11], read)).toEqual({
            title: "Week of 13 Oct",
            big: "₹50,100 from 64 payments",
            note: "13 to 19 Oct, seven days. Your best week in 12.",
        });
        expect(weekSheetWords(read.weeks[0], read).note).toBe(
            "28 Jul to 3 Aug, seven days.",
        );
    });

    it("names money in another currency, left out of the figures", () => {
        expect(otherCurrencyNote(moneyRead())).toBeNull();
        expect(otherCurrencyNote(moneyRead({ otherCurrencies: ["USD"] }))).toBe(
            "Money taken in USD isn't counted here.",
        );
        expect(
            otherCurrencyNote(moneyRead({ otherCurrencies: ["EUR", "USD"] })),
        ).toBe("Money taken in EUR and USD isn't counted here.");
    });
});
