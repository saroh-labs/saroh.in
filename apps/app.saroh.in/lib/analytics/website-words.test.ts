import { describe, expect, it } from "vitest";

import {
    dayReadout,
    dayTick,
    ORDERS_RECORDED_FROM,
    ordersLine,
    pageTitle,
    tickEvery,
} from "./website-words";

describe("website words", () => {
    it("says a day the way the takings do, never as 09-04", () => {
        expect(dayTick("2026-09-04")).toBe("4 Sep");
        expect(
            dayReadout({ date: "2026-10-01", views: 4120, uniques: 1 }),
        ).toBe("Thursday 1 Oct · 4,120 visits · 1 visitor");
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
            "Orders counts from October 2026, when Insights began recording paid orders; earlier ones aren't counted.",
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
