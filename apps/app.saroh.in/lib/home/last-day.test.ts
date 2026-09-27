import { describe, expect, it } from "vitest";

import {
    dateLine,
    firstName,
    greeting,
    sinceLabel,
    sinceLinks,
} from "./last-day";
import type { HomeLastDay, HomeSinceItem } from "./service";

const SINCE = "2026-09-17T04:00:00.000Z";
const at = "since=2026-09-17T04%3A00%3A00.000Z";

function day(over: Partial<HomeLastDay> = {}): HomeLastDay {
    return {
        zone: "Asia/Kolkata",
        date: "2026-09-18",
        partOfDay: "morning",
        since: SINCE,
        fresh: false,
        items: [],
        ...over,
    };
}

function item(over: Partial<HomeSinceItem>): HomeSinceItem {
    return {
        kind: "ORDERS",
        count: 1,
        amountMinor: null,
        currency: null,
        href: `/commerce/orders?${at}`,
        ...over,
    };
}

describe("firstName", () => {
    it("is the name people are called by, past a title", () => {
        expect(firstName("Priya Raman")).toBe("Priya");
        expect(firstName("Dr. Meenakshi Rao")).toBe("Meenakshi");
        expect(firstName("  Kabir  ")).toBe("Kabir");
    });

    it("is null without a name", () => {
        expect(firstName(null)).toBeNull();
        expect(firstName("   ")).toBeNull();
    });
});

describe("greeting", () => {
    it("says good morning in the business's part of the day", () => {
        expect(greeting(day(), "Priya Raman")).toBe("Good morning, Priya");
        expect(greeting(day({ partOfDay: "evening" }), "Kabir Shah")).toBe(
            "Good evening, Kabir",
        );
    });

    it("welcomes a business with nothing yet", () => {
        expect(greeting(day({ fresh: true }), "Priya Raman")).toBe(
            "Welcome, Priya",
        );
    });

    it("greets without a name, and without guessing the hour from an older API", () => {
        expect(greeting(day(), null)).toBe("Good morning");
        expect(greeting(null, "Priya Raman")).toBe("Hello, Priya");
    });
});

describe("dateLine", () => {
    it("names the business's date and the business", () => {
        expect(dateLine(day(), "Rye & Co.")).toBe(
            "Friday 18 September · Rye & Co.",
        );
    });

    it("reads the date as a calendar day, whatever the viewer's zone", () => {
        // Just after midnight in Mumbai is still the 17th in UTC.
        expect(dateLine(day({ date: "2026-09-19" }), "Rye & Co.")).toBe(
            "Saturday 19 September · Rye & Co.",
        );
    });

    it("tells a new business what's first", () => {
        expect(dateLine(day({ fresh: true }), "Kettle & Co.")).toBe(
            "Let's get Kettle & Co. ready to take money.",
        );
    });

    it("is just the business without the header", () => {
        expect(dateLine(null, "Rye & Co.")).toBe("Rye & Co.");
    });
});

describe("sinceLabel", () => {
    it("says each figure in the design's words", () => {
        expect(sinceLabel(item({ count: 3 }))).toBe("3 new orders");
        expect(sinceLabel(item({ count: 1 }))).toBe("1 new order");
        expect(sinceLabel(item({ kind: "BOOKINGS", count: 2 }))).toBe(
            "2 new bookings",
        );
        expect(sinceLabel(item({ kind: "REVIEWS", count: 1 }))).toBe(
            "1 review",
        );
        expect(
            sinceLabel(
                item({
                    kind: "PAYMENTS",
                    count: 4,
                    amountMinor: 1_240_000,
                    currency: "INR",
                }),
            ),
        ).toBe("₹12,400 taken");
    });
});

describe("sinceLinks", () => {
    it("links every figure to the rows it counts", () => {
        const links = sinceLinks(
            day({
                items: [
                    item({ count: 3 }),
                    item({
                        kind: "PAYMENTS",
                        amountMinor: 50_000,
                        currency: "INR",
                        href: `/billing/invoices?${at}`,
                    }),
                    item({
                        kind: "PAYMENTS",
                        amountMinor: 2_000,
                        currency: "USD",
                        href: `/billing/invoices?${at}`,
                    }),
                ],
            }),
        );
        expect(links.map((l) => [l.label, l.href])).toEqual([
            ["3 new orders", `/commerce/orders?${at}`],
            ["₹500 taken", `/billing/invoices?${at}`],
            ["US$20 taken", `/billing/invoices?${at}`],
        ]);
        // Two currencies, two keys.
        expect(new Set(links.map((l) => l.key)).size).toBe(3);
    });

    it("draws no strip for a new business, a quiet day, or an older API", () => {
        expect(sinceLinks(day({ fresh: true, items: [item({})] }))).toEqual([]);
        expect(sinceLinks(day())).toEqual([]);
        expect(sinceLinks(null)).toEqual([]);
    });
});
