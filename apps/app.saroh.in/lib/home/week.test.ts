import { describe, expect, it } from "vitest";

import type { HomeGoing } from "./service";
import {
    goingCards,
    goingIntro,
    MONTH_HREF,
    owedLine,
    showsGoing,
} from "./week";

/** Rye & Co. on a Monday, 19 Oct (board `HAPageD`). */
function going(over: Partial<HomeGoing> = {}): HomeGoing {
    return {
        zone: "Asia/Kolkata",
        from: "2026-10-13",
        to: "2026-10-19",
        beforeFrom: "2026-10-06",
        beforeTo: "2026-10-12",
        ...over,
    };
}

const SALES = {
    currency: "INR",
    amountMinor: 4_825_000,
    beforeMinor: 4_308_000,
    change: { kind: "UP" as const, percent: 12 },
    href: "/billing/invoices?since=x",
};

const OWED = {
    totals: [{ currency: "INR", amountMinor: 3_297_000 }],
    bills: 16,
    overdue: 10,
    byAge: {
        notDue: { count: 6, totals: null, href: "/a" },
        late1to30: { count: 7, totals: null, href: "/b" },
        lateOver30: { count: 3, totals: null, href: "/c" },
    },
    href: "/billing/invoices?view=unpaid",
};

describe("How it's going's words", () => {
    it("names the days it compares", () => {
        expect(goingIntro(going())).toBe(
            "The last 7 days, 13 to 19 Oct, compared with the 7 days before",
        );
        // Across a month end.
        expect(
            goingIntro(going({ from: "2026-09-28", to: "2026-10-04" })),
        ).toBe(
            "The last 7 days, 28 Sep to 4 Oct, compared with the 7 days before",
        );
        // Days it can't read still say what it compares.
        expect(goingIntro(going({ from: "", to: "" }))).toBe(
            "The last 7 days, compared with the 7 days before",
        );
    });

    it("counts the bills owed and the overdue among them", () => {
        expect(owedLine({ bills: 16, overdue: 10 })).toBe(
            "16 bills · 10 overdue",
        );
        expect(owedLine({ bills: 1, overdue: 0 })).toBe("1 bill");
        expect(owedLine({ bills: 0, overdue: 0 })).toBe("All bills paid");
    });
});

describe("goingCards", () => {
    it("draws the busy day's four cards, in the board's order", () => {
        const cards = goingCards(
            going({
                sales: [SALES],
                bookings: { count: 22, before: 18, href: "/bookings" },
                orders: { count: 41, before: 35, href: "/commerce/orders" },
                owed: OWED,
            }),
        );
        expect(cards.map((c) => [c.label, c.value, c.sub, c.tone])).toEqual([
            ["Sales", "₹48,250", "Up 12% on the 7 days before", "up"],
            ["Bookings", "22", "4 more than the 7 days before", "up"],
            ["Orders", "41", "6 more than the 7 days before", "up"],
            ["Owed to you", "₹32,970", "16 bills · 10 overdue", "bad"],
        ]);
        expect(cards.map((c) => c.href)).toEqual([
            SALES.href,
            "/bookings",
            "/commerce/orders",
            OWED.href,
        ]);
    });

    it("on a Monday compares 7 days with 7, never a week just started", () => {
        // A Monday morning with a busy last week: the last 7 days run
        // Tuesday to Monday, so nothing reads "0 · 19 fewer".
        const [bookings] = goingCards(
            going({ bookings: { count: 22, before: 18, href: "/b" } }),
        );
        expect(bookings.value).toBe("22");
        expect(bookings.sub).not.toMatch(/last week|0 ·/);
    });

    it("says a quiet week plainly (board `HAQuietD`)", () => {
        const cards = goingCards(
            going({
                sales: [
                    {
                        ...SALES,
                        amountMinor: 986_000,
                        beforeMinor: 980_000,
                        change: { kind: "LEVEL", percent: 1 },
                    },
                ],
                bookings: { count: 9, before: 9, href: "/b" },
                orders: { count: 12, before: 14, href: "/o" },
                owed: { ...OWED, totals: [], bills: 0, overdue: 0 },
            }),
        );
        expect(cards.map((c) => [c.value, c.sub, c.tone])).toEqual([
            ["₹9,860", "About the same as the 7 days before", "plain"],
            ["9", "Same as the 7 days before", "plain"],
            ["12", "2 fewer than the 7 days before", "plain"],
            ["Nothing", "All bills paid", "plain"],
        ]);
    });

    it("says nothing came in, in words, and marks the fall", () => {
        const [sales] = goingCards(
            going({
                sales: [
                    {
                        ...SALES,
                        amountMinor: 0,
                        change: { kind: "DOWN", percent: 100 },
                    },
                ],
            }),
        );
        expect(sales.value).toBe("Nothing");
        expect(sales.sub).toBe("Down from ₹43,080 in the 7 days before");
        expect(sales.sub).not.toContain("100%");
        expect(sales.tone).toBe("bad");
    });

    it("gives a role without money counts only (board `HAMemberD`)", () => {
        // The API sends no sales and no owed amounts without `payment:read`.
        const cards = goingCards(
            going({
                bookings: { count: 22, before: 18, href: "/b" },
                orders: { count: 41, before: 35, href: "/o" },
            }),
        );
        expect(cards.map((c) => c.label)).toEqual(["Bookings", "Orders"]);
        expect(cards.some((c) => c.value.includes("₹"))).toBe(false);
    });

    it("says what is owed in bills when the amounts are not theirs", () => {
        const [owed] = goingCards(going({ owed: { ...OWED, totals: null } }));
        expect(owed.value).toBe("16 bills");
        expect(owed.value).not.toContain("₹");
    });

    it("draws nothing it wasn't sent", () => {
        expect(goingCards(null)).toEqual([]);
        expect(goingCards(going())).toEqual([]);
    });
});

describe("showsGoing", () => {
    it("is left out for a business with nothing yet, or nothing to show", () => {
        const g = going({ bookings: { count: 1, before: 0, href: "/b" } });
        expect(showsGoing(g, false)).toBe(true);
        expect(showsGoing(g, true)).toBe(false);
        expect(showsGoing(going(), false)).toBe(false);
        expect(showsGoing(null, false)).toBe(false);
    });

    it("leads into Insights on 4 weeks (A10)", () => {
        expect(MONTH_HREF).toBe("/analytics?period=4w");
    });
});
