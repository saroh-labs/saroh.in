import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrderAttention, OrderVisits } from "@/lib/orders/read";

import { VisitsSection } from "./visits-card";

/**
 * The Visits card as the design draws it (B14, `?id=D301`): the visits'
 * stepper, "N of M attended", each visit with its pill, the customer's
 * Needs attention in red, and a booked visit that opens its booking — as a
 * real link with a pointer, hover, focus and pressed state — only for
 * someone who may read bookings.
 */

const now = new Date("2026-09-18T10:40:00Z");

const visits: OrderVisits = {
    total: 3,
    attended: 1,
    booked: 2,
    service: {
        id: "svc",
        name: "Root canal treatment",
        durationMinutes: 60,
        timezone: "UTC",
        priceCents: 1_200_000,
    },
    visits: [
        {
            number: 1,
            bookingId: "bk_1",
            startAt: "2026-09-12T10:00:00Z",
            endAt: "2026-09-12T11:00:00Z",
            staffName: "Dr. Meenakshi Rao",
            where: "IN_PERSON",
            state: "ATTENDED",
            attendedAt: "2026-09-12T11:00:00Z",
            attendedBy: null,
        },
        {
            number: 2,
            bookingId: "bk_2",
            startAt: "2026-09-19T12:30:00Z",
            endAt: "2026-09-19T13:30:00Z",
            staffName: "Dr. Meenakshi Rao",
            where: "ONLINE",
            state: "BOOKED",
            attendedAt: null,
            attendedBy: null,
        },
        {
            number: 3,
            bookingId: null,
            startAt: null,
            endAt: null,
            staffName: null,
            where: "IN_PERSON",
            state: "TO_BOOK",
            attendedAt: null,
            attendedBy: null,
        },
    ],
    next: {
        attend: null,
        upcoming: { number: 2, startAt: "2026-09-19T12:30:00Z" },
        book: null,
    },
    done: false,
    closed: false,
};

const attention: OrderAttention = {
    entries: [
        {
            id: "a1",
            kind: "MEDICAL",
            label: "Diabetic",
            detail: "Check sugar before a long visit",
            sensitive: true,
            allergen: null,
            matchAllergens: [],
            source: "STAFF",
        },
    ],
    hiddenSensitiveCount: 0,
} as unknown as OrderAttention;

const render = (
    over: Partial<Parameters<typeof VisitsSection>[0]> = {},
): string =>
    renderToStaticMarkup(
        <VisitsSection
            visits={visits}
            refunded={false}
            first="Rahul"
            attention={attention}
            canOpenBooking
            now={now}
            {...over}
        />,
    );

describe("VisitsSection (B14)", () => {
    it("draws the stepper, the summary and each visit with its pill", () => {
        const html = render();
        expect(html).toContain('aria-label="Visits: 1 of 3 attended"');
        expect(html).toContain("Visit 1 · 12 Sep");
        expect(html).toContain("1 of 3 attended");
        expect(html).toContain("Attended");
        expect(html).toContain("Booked");
        expect(html).toContain("Not booked");
        expect(html).toContain("Dr. Meenakshi Rao · Video call");
        expect(html).toContain("Book it when Rahul is ready");
    });

    it("says the customer's Needs attention in the card", () => {
        const html = render();
        expect(html).toContain('role="alert"');
        expect(html).toContain("Check sugar before a long visit");
    });

    it("a booked visit opens its booking, with pointer, hover, focus and pressed states", () => {
        const html = render();
        expect(html).toContain('href="/bookings/bk_2"');
        expect(html).toMatch(/cursor-pointer[^"]*hover:bg-muted[^"]*active:/);
        expect(html).toContain("focus-visible:ring-2");
        // A visit still to book has nothing to open.
        expect(html).not.toContain("/bookings/null");
    });

    it("without booking:read the rows are words, not links", () => {
        expect(render({ canOpenBooking: false })).not.toContain("/bookings/");
    });

    it("says so when the visits couldn't be read", () => {
        const html = render({ visits: null });
        expect(html).toContain("couldn&#x27;t be read");
        expect(html).not.toContain("attended</span>");
    });
});
