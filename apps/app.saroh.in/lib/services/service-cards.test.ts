import { describe, expect, it } from "vitest";

import {
    lengthLine,
    servicesSummary,
    takingLabel,
    takingToast,
    usageLine,
} from "./service-cards";

type Card = Parameters<typeof lengthLine>[0];

const card = (over: Partial<Card> = {}): Card => ({
    status: "ACTIVE",
    showOnBookingPage: true,
    durationMinutes: 60,
    bufferAfterMinutes: 15,
    capacity: 1,
    locationType: "IN_PERSON",
    ...over,
});

describe("servicesSummary", () => {
    const list = [
        card(),
        card({ showOnBookingPage: false }),
        card({ status: "ARCHIVED" }),
    ];

    it("counts what the booking page offers, and what is paused", () => {
        expect(servicesSummary(list, true)).toBe(
            "1 on the booking page · 1 paused",
        );
        expect(servicesSummary([card()], null)).toBe("1 on the booking page");
    });

    it("says there is no booking page yet", () => {
        expect(servicesSummary(list, false)).toBe(
            "No booking page yet · 1 paused",
        );
        expect(servicesSummary([card()], false)).toBe("No booking page yet");
    });
});

describe("lengthLine", () => {
    it("says the length, the gap, where and the places", () => {
        expect(lengthLine(card())).toBe("60 min · 15 min gap after");
        expect(lengthLine(card({ locationType: "ONLINE" }))).toBe(
            "60 min · 15 min gap after · Online",
        );
        expect(
            lengthLine(
                card({
                    locationType: "EITHER",
                    capacity: 12,
                    bufferAfterMinutes: 0,
                }),
            ),
        ).toBe("60 min · no gap after · In person or online · 12 places");
    });
});

describe("usageLine", () => {
    it("says how it is booked, and a failed count as such", () => {
        expect(usageLine(card(), { thisWeek: 3, comingUp: 5 })).toBe(
            "3 booked this week · 5 still to come",
        );
        expect(usageLine(card(), null)).toBe("Bookings couldn't be counted");
    });

    it("says a staff-only service isn't on the booking page", () => {
        expect(
            usageLine(card({ showOnBookingPage: false }), {
                thisWeek: 0,
                comingUp: 1,
            }),
        ).toBe(
            "Staff only — not on the booking page · 0 booked this week · 1 still to come",
        );
    });

    it("says a paused service keeps its bookings", () => {
        const paused = card({ status: "ARCHIVED" });
        expect(usageLine(paused, { thisWeek: 0, comingUp: 0 })).toBe(
            "Paused — hidden from the booking page",
        );
        expect(usageLine(paused, { thisWeek: 0, comingUp: 1 })).toBe(
            "Paused — hidden from the booking page; its 1 booking still to come still happens",
        );
        expect(usageLine(paused, { thisWeek: 0, comingUp: 2 })).toContain(
            "its 2 bookings still to come still happen",
        );
    });
});

describe("the Stop / Take bookings again switch", () => {
    it("reads Stop taking bookings, and says what it did", () => {
        expect(takingLabel(true)).toBe("Stop taking bookings");
        expect(takingLabel(false)).toBe("Take bookings again");
        expect(takingToast("Yoga", true)).toBe(
            "Yoga paused. It's off the booking page; bookings already made still happen.",
        );
        expect(takingToast("Yoga", false)).toBe("Yoga is bookable again.");
    });
});
