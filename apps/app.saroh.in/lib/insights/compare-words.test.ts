import { describe, expect, it } from "vitest";

import type { CompareChange } from "./compare-words";
import {
    comparesLine,
    countChangeLine,
    countWords,
    daysLabel,
    goingSentence,
    markNote,
    moneyChangeLine,
    moneyFell,
    shownShares,
} from "./compare-words";

/**
 * Comparisons in words (DEC-171, #1081), pinned word for word: periods with
 * their days, zero in words, no "100% below", no 0% places, nothing more
 * than is true, and the phone's one sentence with money, without it, with
 * one figure up and one down, and with nothing earlier.
 */

const up = (percent: number) => ({ kind: "UP" as const, percent });
const down = (percent: number) => ({ kind: "DOWN" as const, percent });
const THIN = { kind: "THIN" as const };
const LEVEL = { kind: "LEVEL" as const, percent: 0 };

const inr = (
    nowMinor: number,
    beforeMinor: number,
    change: CompareChange = LEVEL,
) => ({
    nowMinor,
    beforeMinor,
    currency: "INR",
    change,
});

describe("daysLabel", () => {
    it("names a period with its days", () => {
        expect(daysLabel("2026-10-13", "2026-10-19")).toBe("13 to 19 Oct");
        expect(daysLabel("2026-09-28", "2026-10-04")).toBe("28 Sep to 4 Oct");
        expect(daysLabel("2025-12-29", "2026-01-04")).toBe(
            "29 Dec 2025 to 4 Jan 2026",
        );
        expect(daysLabel("2026-10-19", "2026-10-19")).toBe("19 Oct");
        expect(daysLabel("", "2026-10-19")).toBe("");
    });

    it("says which days are set against which", () => {
        expect(
            comparesLine({
                from: "2026-10-13",
                to: "2026-10-19",
                beforeFrom: "2026-10-06",
                beforeTo: "2026-10-12",
            }),
        ).toBe("13 to 19 Oct, against 6 to 12 Oct.");
    });
});

describe("moneyChangeLine", () => {
    it("says up, down and about the same", () => {
        expect(moneyChangeLine(inr(11_200_00, 10_000_00, up(12)))).toBe(
            "Up 12% on the 7 days before",
        );
        expect(moneyChangeLine(inr(9_200_00, 10_000_00, down(8)))).toBe(
            "Down 8% on the 7 days before",
        );
        expect(moneyChangeLine(inr(10_000_00, 10_000_00, LEVEL))).toBe(
            "About the same as the 7 days before",
        );
        // 2% or less either way is about the same.
        expect(moneyChangeLine(inr(10_200_00, 10_000_00, up(2)))).toBe(
            "About the same as the 7 days before",
        );
        expect(moneyChangeLine(inr(9_800_00, 10_000_00, down(2)))).toBe(
            "About the same as the 7 days before",
        );
        expect(moneyChangeLine(inr(10_300_00, 10_000_00, up(3)))).toBe(
            "Up 3% on the 7 days before",
        );
    });

    it("names the period it compares with", () => {
        expect(moneyChangeLine({ ...inr(1, 1, up(20)), period: "4w" })).toBe(
            "Up 20% on the 4 weeks before",
        );
        expect(moneyChangeLine({ ...inr(1, 1, down(20)), period: "3m" })).toBe(
            "Down 20% on the 3 months before",
        );
    });

    it("says a drop to nothing in words, never 100% below", () => {
        expect(moneyChangeLine(inr(0, 4_000_00, down(100)))).toBe(
            "Down from ₹4,000 in the 7 days before",
        );
        // A big drop that left a little is still less than all of it.
        expect(moneyChangeLine(inr(10_00, 4_000_00, down(100)))).toBe(
            "Down 99% on the 7 days before",
        );
        expect(moneyChangeLine(inr(1_000_00, 4_000_00, down(75)))).toBe(
            "Down 75% on the 7 days before",
        );
        expect(moneyFell(inr(0, 4_000_00, down(100)))).toBe(true);
        expect(moneyFell(inr(1_000_00, 4_000_00, down(75)))).toBe(true);
        expect(moneyFell(inr(9_800_00, 10_000_00, down(2)))).toBe(false);
    });

    it("says why there is no comparing", () => {
        // 0 → N: nothing before.
        expect(moneyChangeLine(inr(4_000_00, 0, THIN))).toBe(
            "Nothing came in the 7 days before",
        );
        expect(moneyFell(inr(4_000_00, 0, THIN))).toBe(false);
        expect(moneyChangeLine(inr(4_000_00, 100_00, THIN))).toBe(
            "Too little came in the 7 days before to compare",
        );
        expect(moneyChangeLine(inr(0, 0, THIN))).toBe(
            "Nothing came in the 7 days before either",
        );
    });

    it("keeps a big rise to what is true", () => {
        expect(moneyChangeLine(inr(30_000_00, 10_000_00, up(200)))).toBe(
            "About 3 times the 7 days before",
        );
        expect(moneyChangeLine(inr(19_900_00, 10_000_00, up(199)))).toBe(
            "Up 199% on the 7 days before",
        );
    });
});

describe("countChangeLine", () => {
    it("says the difference in things, not a percent", () => {
        expect(countChangeLine(22, 18)).toBe("4 more than the 7 days before");
        expect(countChangeLine(15, 18)).toBe("3 fewer than the 7 days before");
        expect(countChangeLine(18, 18)).toBe("Same as the 7 days before");
        expect(countChangeLine(1, 2, "4w")).toBe(
            "1 fewer than the 4 weeks before",
        );
        expect(countChangeLine(1_204, 4)).toBe(
            "1,200 more than the 7 days before",
        );
    });

    it("says 0 → N and nothing at all in words", () => {
        expect(countChangeLine(5, 0)).toBe("None in the 7 days before");
        expect(countChangeLine(0, 0)).toBe("None in the 7 days before either");
        expect(countChangeLine(0, 3)).toBe("3 fewer than the 7 days before");
    });

    it("says one thing and many", () => {
        expect(countWords(0, "booking")).toBe("no bookings");
        expect(countWords(1, "booking")).toBe("1 booking");
        expect(countWords(22, "booking")).toBe("22 bookings");
        expect(countWords(2, "person", "people")).toBe("2 people");
    });
});

describe("markNote", () => {
    it("marks the lowest or highest week", () => {
        expect(
            markNote({
                amountMinor: 1_090_00,
                currency: "INR",
                when: "last week",
                weeks: 12,
                mark: "LOWEST",
            }),
        ).toBe("₹1,090 last week, your lowest in 12 weeks");
        expect(
            markNote({
                amountMinor: 0,
                currency: "INR",
                when: "last week",
                weeks: 12,
                mark: "LOWEST",
            }),
        ).toBe("Nothing came in last week, your lowest in 12 weeks");
        expect(
            markNote({
                amountMinor: 15_000_00,
                currency: "INR",
                when: "the week of 14 Sep",
                weeks: 5,
                mark: "HIGHEST",
            }),
        ).toBe("₹15,000 the week of 14 Sep, your highest in 5 weeks");
    });

    it("says nothing with too little history", () => {
        expect(
            markNote({
                amountMinor: 1_090_00,
                currency: "INR",
                when: "last week",
                weeks: 1,
                mark: "LOWEST",
            }),
        ).toBeNull();
    });
});

describe("goingSentence", () => {
    const sales = (
        amountMinor: number,
        beforeMinor: number,
        change: CompareChange,
    ) => [{ currency: "INR", amountMinor, beforeMinor, change }];

    it("says the money, with its change, for a role with money", () => {
        expect(
            goingSentence({
                sales: sales(48_250_00, 43_080_00, up(12)),
                bookings: { count: 22, before: 18 },
            }),
        ).toBe("Last 7 days: ₹48,250, up 12% on the 7 days before.");
        expect(
            goingSentence({ sales: sales(40_000_00, 60_000_00, down(33)) }),
        ).toBe("Last 7 days: ₹40,000, down 33% on the 7 days before.");
        expect(
            goingSentence({ sales: sales(48_250_00, 48_000_00, LEVEL) }),
        ).toBe("Last 7 days: ₹48,250, about the same as the 7 days before.");
    });

    it("says when there is nothing earlier to compare", () => {
        expect(goingSentence({ sales: sales(4_000_00, 0, THIN) })).toBe(
            "Last 7 days: ₹4,000. Nothing came in the 7 days before.",
        );
        expect(goingSentence({ sales: sales(4_000_00, 50_00, THIN) })).toBe(
            "Last 7 days: ₹4,000. Too little came in the 7 days before to compare.",
        );
    });

    it("says a drop to nothing in words", () => {
        expect(goingSentence({ sales: sales(0, 4_000_00, down(100)) })).toBe(
            "Nothing came in the last 7 days, against ₹4,000 in the 7 days before.",
        );
        expect(goingSentence({ sales: sales(0, 0, THIN) })).toBe(
            "Nothing came in the last 7 days.",
        );
    });

    it("turns to bookings and orders when no money came in but people did", () => {
        expect(
            goingSentence({
                sales: sales(0, 0, THIN),
                bookings: { count: 3, before: 1 },
            }),
        ).toBe("Last 7 days: 3 bookings, 2 more than the 7 days before.");
    });

    it("says each currency once, without a change it can't add up", () => {
        expect(
            goingSentence({
                sales: [
                    {
                        currency: "INR",
                        amountMinor: 48_250_00,
                        beforeMinor: 1,
                        change: up(12),
                    },
                    {
                        currency: "USD",
                        amountMinor: 120_00,
                        beforeMinor: 0,
                        change: THIN,
                    },
                ],
            }),
        ).toMatch(/^Last 7 days: ₹48,250 and .*120.*\.$/);
    });

    it("says counts, never amounts, for a role without money", () => {
        expect(
            goingSentence({
                bookings: { count: 22, before: 18 },
                orders: { count: 41, before: 30 },
            }),
        ).toBe(
            "Last 7 days: 22 bookings and 41 orders, both up on the 7 days before.",
        );
        expect(
            goingSentence({
                bookings: { count: 12, before: 18 },
                orders: { count: 20, before: 30 },
            }),
        ).toBe(
            "Last 7 days: 12 bookings and 20 orders, both down on the 7 days before.",
        );
        expect(
            goingSentence({
                bookings: { count: 18, before: 18 },
                orders: { count: 30, before: 30 },
            }),
        ).toBe(
            "Last 7 days: 18 bookings and 30 orders, both the same as the 7 days before.",
        );
    });

    it("says one figure up and one down on their own", () => {
        expect(
            goingSentence({
                bookings: { count: 22, before: 18 },
                orders: { count: 41, before: 45 },
            }),
        ).toBe(
            "Last 7 days: 22 bookings, up from 18, and 41 orders, down from 45.",
        );
        expect(
            goingSentence({
                bookings: { count: 1, before: 0 },
                orders: { count: 41, before: 45 },
            }),
        ).toBe(
            "Last 7 days: 1 booking, up from none, and 41 orders, down from 45.",
        );
    });

    it("says one item and many, and zero in words", () => {
        expect(goingSentence({ bookings: { count: 1, before: 1 } })).toBe(
            "Last 7 days: 1 booking, same as the 7 days before.",
        );
        expect(goingSentence({ orders: { count: 1, before: 0 } })).toBe(
            "Last 7 days: 1 order. None in the 7 days before.",
        );
        expect(goingSentence({ bookings: { count: 0, before: 3 } })).toBe(
            "No bookings in the last 7 days. The 7 days before had 3 bookings.",
        );
        expect(goingSentence({ bookings: { count: 0, before: 1 } })).toBe(
            "No bookings in the last 7 days. The 7 days before had 1 booking.",
        );
        expect(goingSentence({ bookings: { count: 0, before: 0 } })).toBe(
            "No bookings in the last 7 days.",
        );
        expect(
            goingSentence({
                bookings: { count: 0, before: 0 },
                orders: { count: 5, before: 2 },
            }),
        ).toBe(
            "Last 7 days: no bookings, the same as before, and 5 orders, up from 2.",
        );
    });

    it("says when neither count has anything earlier", () => {
        expect(
            goingSentence({
                bookings: { count: 22, before: 0 },
                orders: { count: 41, before: 0 },
            }),
        ).toBe(
            "Last 7 days: 22 bookings and 41 orders. None in the 7 days before.",
        );
        expect(
            goingSentence({
                bookings: { count: 0, before: 0 },
                orders: { count: 0, before: 0 },
            }),
        ).toBe("No bookings or orders in the last 7 days.");
        expect(
            goingSentence({
                bookings: { count: 0, before: 4 },
                orders: { count: 0, before: 1 },
            }),
        ).toBe(
            "No bookings or orders in the last 7 days. The 7 days before had 4 bookings and 1 order.",
        );
    });

    it("leaves the line out when the person may read none of it", () => {
        expect(goingSentence({})).toBeNull();
    });

    it("names Insights' longer periods", () => {
        expect(
            goingSentence({ sales: sales(48_250_00, 43_080_00, up(12)) }, "4w"),
        ).toBe("Last 4 weeks: ₹48,250, up 12% on the 4 weeks before.");
    });
});

describe("shownShares", () => {
    it("leaves out a place under 1%", () => {
        expect(
            shownShares([
                { name: "Hill Road", percent: 100 },
                { name: "Online", percent: 0 },
            ]),
        ).toEqual([{ name: "Hill Road", percent: 100 }]);
        expect(shownShares([{ percent: 99 }, { percent: 1 }])).toHaveLength(2);
    });
});
