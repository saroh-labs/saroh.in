import { describe, expect, it } from "vitest";

import {
    dayReadout,
    dayTick,
    figureChange,
    ORDERS_RECORDED_FROM,
    ordersLine,
    pageTitle,
    tickEvery,
    visitsLine,
} from "./website-words";

describe("website words", () => {
    it("says a day the way the takings do, never as 09-04", () => {
        expect(dayTick("2026-09-04")).toBe("4 Sep");
        expect(
            dayReadout({ date: "2026-10-01", views: 4120, uniques: 1 }),
        ).toBe("Thursday 1 Oct · 4,120 visits · 1 visitor");
        expect(dayReadout({ date: "2026-10-02", views: 12, uniques: 9 })).toBe(
            "Friday 2 Oct · 12 visits · 9 visitors",
        );
    });

    it("says a day nobody came in words, never 0 visits", () => {
        expect(dayReadout({ date: "2026-10-01", views: 0, uniques: 0 })).toBe(
            "Thursday 1 Oct · no visits",
        );
    });

    it("names a page from its address", () => {
        expect(pageTitle("/")).toBe("Home page");
        expect(pageTitle("/products/kraft-mailer-box")).toBe(
            "Kraft mailer box",
        );
        expect(pageTitle("/blog/choosing_the-right-mailer/")).toBe(
            "Choosing the right mailer",
        );
        expect(pageTitle("/contact?ref=ig")).toBe("Contact");
        expect(pageTitle("/caf%C3%A9-menu")).toBe("Café menu");
        // A broken escape is shown as written, never thrown.
        expect(pageTitle("/100%-cotton")).toBe("100% cotton");
    });

    it("labels about the asked number of days", () => {
        expect(tickEvery(30, 6)).toBe(5);
        expect(tickEvery(7, 6)).toBe(2);
        expect(tickEvery(3, 6)).toBe(1);
        expect(tickEvery(0, 6)).toBe(1);
    });
});

describe("the line under Orders (#919)", () => {
    // A range wholly after orders began to be recorded, and one before.
    const after = "2027-01-04";
    const before = "2026-09-10";

    it("says nothing when the figure needs no words", () => {
        expect(
            ordersLine({ orders: 4, from: after, rangeLabel: "30 days" }),
        ).toBeNull();
    });

    it("says no paid orders came in, in the range's own words", () => {
        expect(
            ordersLine({ orders: 0, from: after, rangeLabel: "7 days" }),
        ).toBe("No paid orders in the last 7 days.");
    });

    it("never calls nothing recorded nothing paid, before recording began", () => {
        // DEC-012: no event is made up for an order paid before #867.
        expect(
            ordersLine({ orders: 0, from: before, rangeLabel: "30 days" }),
        ).toBe(
            "No paid orders recorded in the last 30 days. Insights began recording them in October 2026, so earlier ones aren't counted.",
        );
        expect(
            ordersLine({ orders: 12, from: before, rangeLabel: "90 days" }),
        ).toBe(
            "Orders counts from October 2026, when Insights began recording paid orders. Earlier ones aren't counted.",
        );
    });

    it("stops saying so once the range starts on the day recording is sure", () => {
        expect(
            ordersLine({
                orders: 3,
                from: ORDERS_RECORDED_FROM,
                rangeLabel: "7 days",
            }),
        ).toBeNull();
    });
});

describe("the visits sentence (IBFromD)", () => {
    const day = (date: string, views: number, uniques = views) => ({
        date,
        views,
        uniques,
    });

    it("says the visits, the visitors, the busiest day and the day nobody came", () => {
        expect(
            visitsLine(
                [
                    day("2026-09-30", 40, 30),
                    day("2026-10-01", 0),
                    day("2026-10-03", 101, 72),
                ],
                "4w",
            ),
        ).toBe(
            "141 visits from 102 visitors. Busiest on Saturday 3 Oct. On 1 Oct nobody visited.",
        );
    });

    it("counts the empty days when there are several", () => {
        expect(
            visitsLine(
                [
                    day("2026-10-01", 0),
                    day("2026-10-02", 3),
                    day("2026-10-03", 0),
                ],
                "7d",
            ),
        ).toBe(
            "3 visits from 3 visitors. Busiest on Friday 2 Oct. Nobody visited on 2 days.",
        );
    });

    it("says no visits in words", () => {
        expect(visitsLine([day("2026-10-01", 0)], "3m")).toBe(
            "No visits to your website in the last 3 months.",
        );
    });

    it("leaves the empty days out when there are none", () => {
        expect(visitsLine([day("2026-10-01", 1)], "7d")).toBe(
            "1 visit from 1 visitor. Busiest on Thursday 1 Oct.",
        );
    });
});

describe("a figure's change", () => {
    it("says the difference as a count, up when there were more", () => {
        expect(figureChange(23, 18, "4w")).toEqual({
            line: "5 more than the 4 weeks before",
            up: true,
        });
        expect(figureChange(8, 11, "7d")).toEqual({
            line: "3 fewer than the 7 days before",
            up: false,
        });
        expect(figureChange(4, 0, "3m")).toEqual({
            line: "None in the 3 months before",
            up: false,
        });
    });

    it("says nothing when the period before couldn't be read", () => {
        expect(figureChange(4, null, "4w")).toBeNull();
    });
});

describe("the orders note for one website", () => {
    it("says orders are the whole business's", () => {
        expect(
            ordersLine({
                orders: 3,
                from: "2027-02-01",
                rangeLabel: "4 weeks",
                oneSite: true,
            }),
        ).toBe(
            "Paid orders and bookings are counted for your whole business, not one website.",
        );
    });

    it("adds it after the counted-from line", () => {
        expect(
            ordersLine({
                orders: 0,
                from: "2027-02-01",
                rangeLabel: "4 weeks",
                oneSite: true,
            }),
        ).toBe(
            "No paid orders in the last 4 weeks. Paid orders and bookings are counted for your whole business, not one website.",
        );
    });
});
