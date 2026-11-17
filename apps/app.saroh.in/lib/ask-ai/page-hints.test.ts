import { isAskAiStarter } from "@saroh/api-contract";
import { describe, expect, it } from "vitest";

import type { CalendarDay } from "@/lib/calendar/types";
import type { AskAiPage } from "./page-hints";
import {
    businessPage,
    calendarMonthPage,
    calendarWeekPage,
    customerPage,
} from "./page-hints";

/** Every question asked as written is one the API lets through free. */
function asksOnlyStarters(page: AskAiPage) {
    for (const s of page.suggestions) {
        if (!s.fill) expect(isAskAiStarter(s.question)).toBe(true);
    }
}

const item = (kind: string, subtitle: string | null = null) => ({
    id: kind,
    kind,
    title: kind,
    subtitle,
    at: null,
    link: { type: "booking" as const, id: "b" },
});

const day = (
    date: string,
    bookings: number,
    classes: ReturnType<typeof item>[] = [],
): CalendarDay => ({
    date,
    toActOn: 0,
    layers: {
        bookings: { count: bookings, kinds: {}, items: [] },
        classes: { count: classes.length, kinds: {}, items: classes },
    },
});

describe("Ask AI's page hints (AF 1, 2, 5)", () => {
    it("the whole business: this month by name, today's orders due", () => {
        const page = businessPage({
            today: "2026-11-16",
            dueToday: 4,
            bookings: true,
        });
        expect(page.about).toBeNull();
        expect(page.suggestions.map((s) => s.label)).toEqual([
            "November vs October",
            "Regulars who haven't been back",
            "Free time this week",
            "Best sellers this month",
            "Mark today's orders ready…",
            "Move a booking…",
        ]);
        expect(page.suggestions[4]).toMatchObject({
            hint: "4 due",
            fill: true,
        });
        asksOnlyStarters(page);
    });

    it("leaves out what the business doesn't have", () => {
        const page = businessPage({ today: "2026-01-05" });
        expect(page.suggestions[0].label).toBe("January vs December");
        expect(page.suggestions.some((s) => s.fill)).toBe(false);
    });

    it("a week: its busiest day and the first class with seats", () => {
        const page = calendarWeekPage(
            {
                timezone: "Asia/Kolkata",
                layers: ["bookings", "classes"],
                days: [
                    day("2026-11-16", 2),
                    day("2026-11-17", 1, [item("full")]),
                    day("2026-11-21", 4, [item("class", "5 of 8 booked")]),
                ],
            },
            "2026-11-16",
        );
        expect(page.about).toEqual({
            kind: "calendar",
            label: "Calendar · 16–22 Nov",
        });
        expect(page.intro).toBe("Looking at your Calendar, 16 to 22 Nov.");
        const hints = Object.fromEntries(
            page.suggestions.map((s) => [s.label, s.hint ?? null]),
        );
        expect(hints["Which classes still have seats?"]).toBe("Sat · 3 seats");
        expect(hints["Busiest day this week"]).toBe("Sat · 5 things");
        asksOnlyStarters(page);
    });

    it("a month names the month", () => {
        const page = calendarMonthPage("2026-11", "2026-11-16");
        expect(page.about?.label).toBe("Calendar · November");
        asksOnlyStarters(page);
    });

    it("a customer: what they usually order and when they last came", () => {
        const order = (placedAt: string, ...names: string[]) => ({
            placedAt,
            items: names.map((name) => ({ name })),
        });
        const page = customerPage(
            {
                id: "c1",
                name: "Kavya Menon",
                firstName: "Kavya",
                createdAt: "2026-06-03T10:00:00Z",
            },
            {
                zone: "Asia/Kolkata",
                total: 9,
                orders: [
                    order("2026-09-02T10:00:00Z", "Cardamom bun box"),
                    order("2026-08-29T10:00:00Z", "Cardamom bun box"),
                    order("2026-08-08T10:00:00Z", "Cake tasting"),
                ],
                visits: [],
                now: new Date("2026-11-16T10:00:00Z"),
            },
        );
        expect(page.about).toEqual({
            kind: "customer",
            id: "c1",
            label: "Kavya Menon",
        });
        expect(page.intro).toBe("Looking at Kavya Menon: 9 orders since June.");
        expect(page.placeholder).toBe("Ask about Kavya");
        expect(page.suggestions.map((s) => [s.label, s.hint ?? null])).toEqual([
            ["What do they usually order?", "Cardamom bun box · 2 of 3"],
            ["When did they last come?", "2 Sep · 75 days ago"],
            ["Why did they stop coming?", null],
            ["Order Kavya's usual…", null],
            ["Book Kavya in…", null],
        ]);
        asksOnlyStarters(page);
    });
});
