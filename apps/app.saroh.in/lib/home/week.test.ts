import { describe, expect, it } from "vitest";

import type { HomeWeek } from "./service";
import {
    bookingsLine,
    changeLine,
    owedLine,
    showsWeek,
    sinceMonday,
    weekRows,
} from "./week";

const MONDAY = "2026-09-13T18%3A30%3A00.000Z";

function week(over: Partial<HomeWeek> = {}): HomeWeek {
    return { zone: "Asia/Kolkata", startDate: "2026-09-14", ...over };
}

describe("the words", () => {
    it("says how the takings compare", () => {
        expect(changeLine({ kind: "UP", percent: 12 })).toBe(
            "Up 12% on the same days last week",
        );
        expect(changeLine({ kind: "DOWN", percent: 8 })).toBe(
            "Down 8% on the same days last week",
        );
        expect(changeLine({ kind: "LEVEL", percent: 0 })).toBe(
            "Level with last week",
        );
        expect(changeLine({ kind: "THIN" })).toBe(
            "Not enough last week to compare",
        );
    });

    it("compares the bookings by how many more or fewer", () => {
        expect(bookingsLine(14, 11)).toBe("3 more than last week");
        expect(bookingsLine(9, 11)).toBe("2 fewer than last week");
        expect(bookingsLine(4, 4)).toBe("Same as last week");
        expect(bookingsLine(4, 0)).toBe("Nothing booked last week to compare");
    });

    it("dates the orders from the business's Monday", () => {
        expect(sinceMonday("2026-09-14")).toBe("Since Monday 14 Sep");
        expect(sinceMonday("2026-12-28")).toBe("Since Monday 28 Dec");
        // A date it can't read still says what the count is since.
        expect(sinceMonday("")).toBe("Since Monday");
    });

    it("counts the bills owed and the overdue among them", () => {
        const owed = { totals: [], href: "/x" };
        expect(owedLine({ ...owed, bills: 3, overdue: 1 })).toBe(
            "3 bills · 1 overdue",
        );
        expect(owedLine({ ...owed, bills: 1, overdue: 0 })).toBe("1 bill");
        expect(owedLine({ ...owed, bills: 0, overdue: 0 })).toBe(
            "Nothing unpaid",
        );
    });
});

describe("weekRows", () => {
    it("draws the design's rows for Rye, in its order", () => {
        const rows = weekRows(
            week({
                takings: [
                    {
                        currency: "INR",
                        amountMinor: 1_845_000,
                        lastWeekMinor: 1_647_000,
                        change: { kind: "UP", percent: 12 },
                        href: `/billing/invoices?since=${MONDAY}`,
                    },
                ],
                orders: {
                    count: 23,
                    href: `/commerce/orders?since=${MONDAY}`,
                },
                owed: {
                    totals: [{ currency: "INR", amountMinor: 640_000 }],
                    bills: 3,
                    overdue: 1,
                    href: "/billing/invoices?view=overdue",
                },
            }),
        );
        expect(rows.map((r) => [r.label, r.value, r.sub, r.bad])).toEqual([
            [
                "Sales so far",
                "₹18,450",
                "Up 12% on the same days last week",
                false,
            ],
            ["Orders this week", "23", "Since Monday 14 Sep", false],
            ["Owed to you", "₹6,400", "3 bills · 1 overdue", true],
        ]);
        expect(rows.map((r) => r.href)).toEqual([
            `/billing/invoices?since=${MONDAY}`,
            `/commerce/orders?since=${MONDAY}`,
            "/billing/invoices?view=overdue",
        ]);
    });

    it("says takings down in the danger colour", () => {
        const [row] = weekRows(
            week({
                takings: [
                    {
                        currency: "INR",
                        amountMinor: 500_000,
                        lastWeekMinor: 800_000,
                        change: { kind: "DOWN", percent: 38 },
                        href: "/x",
                    },
                ],
            }),
        );
        expect(row.bad).toBe(true);
    });

    it("leaves out takings before any money has come in, and orders before any is placed", () => {
        const rows = weekRows(
            week({
                takings: [
                    {
                        currency: "INR",
                        amountMinor: 0,
                        lastWeekMinor: 0,
                        change: { kind: "THIN" },
                        href: "/x",
                    },
                ],
                orders: { count: 0, href: "/y" },
                bookings: { count: 0, lastWeek: 3, href: "/bookings" },
            }),
        );
        expect(rows.map((r) => [r.label, r.value, r.sub])).toEqual([
            ["Bookings this week", "0", "3 fewer than last week"],
        ]);
    });

    it("shows a Member only what the API sent them: bookings, no money", () => {
        const rows = weekRows(
            week({ bookings: { count: 6, lastWeek: 6, href: "/bookings" } }),
        );
        expect(rows.map((r) => r.key)).toEqual(["bookings"]);
    });

    it("says all paid rather than inventing a currency for nothing owed", () => {
        const [row] = weekRows(
            week({ owed: { totals: [], bills: 0, overdue: 0, href: "/x" } }),
        );
        expect(row).toMatchObject({
            value: "All paid",
            sub: "Nothing unpaid",
            bad: false,
        });
    });
});

describe("showsWeek", () => {
    const some = week({
        bookings: { count: 2, lastWeek: 1, href: "/bookings" },
    });

    it("draws the panel when there's a row to show", () => {
        expect(showsWeek(some, false)).toBe(true);
    });

    it("draws nothing for a new business, an older API, or an empty week", () => {
        expect(showsWeek(some, true)).toBe(false);
        expect(showsWeek(null, false)).toBe(false);
        expect(showsWeek(week(), false)).toBe(false);
    });
});
