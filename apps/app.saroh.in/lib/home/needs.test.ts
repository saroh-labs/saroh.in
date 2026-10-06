import { describe, expect, it } from "vitest";

import {
    NEEDS_SHOWN,
    formatList,
    needLine,
    needTitle,
    needsState,
    nextLine,
    seeAllLabel,
    shownNeeds,
    thingsLabel,
} from "./needs";
import type { HomeBooking, HomeNeed } from "./service";

function need(over: Partial<HomeNeed> = {}): HomeNeed {
    return {
        id: "COMMERCE_OPEN_ORDERS:o1",
        code: "COMMERCE_OPEN_ORDERS",
        severity: "OVERDUE",
        title: "Send order #1042 to Anika Rao",
        sub: "Placed yesterday",
        amountMinor: null,
        currency: null,
        amountIn: null,
        tag: "Late · 1 day",
        tone: "bad",
        href: "/commerce/orders/o1",
        ...over,
    };
}

describe("needTitle", () => {
    it("leads with the money when the row is about the money", () => {
        const invoice = need({
            title: "overdue from Farah Khan",
            amountMinor: 480000,
            currency: "INR",
            amountIn: "title",
        });
        expect(needTitle(invoice)).toBe("₹4,800 overdue from Farah Khan");
    });

    it("starts a sentence when the money it follows isn't there", () => {
        const noMoney = need({
            title: "overdue from Farah Khan",
            amountIn: "title",
        });
        expect(needTitle(noMoney)).toBe("Overdue from Farah Khan");
    });

    it("leaves a plain title as it is", () => {
        expect(needTitle(need())).toBe("Send order #1042 to Anika Rao");
    });
});

/**
 * R34: a website order to pay on handover nobody came for in three days is
 * an Attention row naming the order and the customer, with its money on
 * the line and the days in its tag, linking to the order.
 */
describe("an order nobody came for", () => {
    const uncollected = need({
        id: "COMMERCE_UNCOLLECTED_ORDERS:o7",
        code: "COMMERCE_UNCOLLECTED_ORDERS",
        severity: "ATTENTION",
        title: "Anika Rao hasn't collected order #1042",
        sub: "Placed 5 Oct to pay on collection, not paid yet. Cancel it to put the stock back, or keep waiting.",
        amountMinor: 48000,
        currency: "INR",
        amountIn: "sub",
        tag: "Not collected: 4 days",
        href: "/commerce/orders/o7",
    });

    it("reads as the order and the customer, its money first on the line", () => {
        expect(needTitle(uncollected)).toBe(
            "Anika Rao hasn't collected order #1042",
        );
        expect(needLine(uncollected)).toBe(
            "₹480 · Placed 5 Oct to pay on collection, not paid yet. Cancel it to put the stock back, or keep waiting.",
        );
    });

    it("is drawn like any other row: it counts toward the list, in the API's order", () => {
        const rows = [uncollected, need()];
        expect(shownNeeds(rows, false).rows).toEqual(rows);
        expect(needsState(rows, [])).toBe("list");
    });
});

describe("needLine", () => {
    it("puts the money first on the line", () => {
        const order = need({
            amountMinor: 340000,
            currency: "INR",
            amountIn: "sub",
        });
        expect(needLine(order)).toBe("₹3,400 · Placed yesterday");
    });

    it("never prints money the API didn't place", () => {
        expect(needLine(need({ amountMinor: 340000, currency: "INR" }))).toBe(
            "Placed yesterday",
        );
    });

    it("gives nothing when there is no line and no money", () => {
        expect(needLine(need({ sub: null }))).toBeNull();
    });
});

describe("thingsLabel", () => {
    it("counts things, and says nothing for none", () => {
        expect(thingsLabel(0)).toBe("");
        expect(thingsLabel(1)).toBe("1 thing");
        expect(thingsLabel(14)).toBe("14 things");
    });
});

describe("shownNeeds", () => {
    const many = Array.from({ length: 15 }, (_, i) => need({ id: `n${i}` }));

    it("shows twelve, in the API's order, then offers the rest", () => {
        const { rows, more } = shownNeeds(many, false);
        expect(rows).toHaveLength(NEEDS_SHOWN);
        expect(rows.map((r) => r.id)).toEqual(
            many.slice(0, 12).map((r) => r.id),
        );
        expect(more).toBe(true);
    });

    it("shows every row once asked", () => {
        expect(shownNeeds(many, true)).toEqual({ rows: many, more: false });
    });

    it("offers nothing more at twelve or fewer", () => {
        expect(shownNeeds(many.slice(0, 12), false).more).toBe(false);
    });
});

describe("seeAllLabel", () => {
    it("counts the rows it opens, not the things a 'N more' row stands for (H-8)", () => {
        const rows = Array.from({ length: 13 }, (_, i) =>
            need({ id: `r${i}` }),
        );
        // The last is "20 more open orders": needsTotal would say 32.
        rows.push(need({ id: "COMMERCE_OPEN_ORDERS:more" }));
        expect(seeAllLabel(rows)).toBe("See all 14");
    });
});

describe("needsState", () => {
    it("is a list whenever there is a row, even with a part missing", () => {
        expect(
            needsState([need()], [{ moduleKey: "COMMERCE", label: "Stock" }]),
        ).toBe("list");
    });

    it("is all clear only when every source was read", () => {
        expect(needsState([], [])).toBe("clear");
    });

    it("never says all clear with a source that failed", () => {
        expect(
            needsState([], [{ moduleKey: "COMMERCE", label: "Stock" }]),
        ).toBe("unknown");
    });
});

describe("formatList", () => {
    it("joins names as a sentence does", () => {
        expect(formatList(["Stock"])).toBe("Stock");
        expect(formatList(["Stock", "Website"])).toBe("Stock and Website");
        expect(formatList(["A", "B", "C"])).toBe("A, B and C");
    });
});

describe("nextLine", () => {
    const NOW = new Date("2026-09-18T04:00:00.000Z"); // 09:30 in Kolkata
    const booking = (startAt: string): HomeBooking => ({
        id: "b1",
        startAt,
        endAt: startAt,
        timezone: "Asia/Kolkata",
        serviceName: "Haircut",
        who: "Dev",
        status: "CONFIRMED",
        href: "/bookings",
    });

    it("names the next booking today, at its own time", () => {
        expect(nextLine([booking("2026-09-18T05:00:00.000Z")], NOW)).toBe(
            "Next: 10:30 Haircut.",
        );
    });

    it("enjoys the quiet when the next booking is another day", () => {
        expect(nextLine([booking("2026-09-19T05:00:00.000Z")], NOW)).toBe(
            "Enjoy the quiet.",
        );
        expect(nextLine([], NOW)).toBe("Enjoy the quiet.");
    });
});
