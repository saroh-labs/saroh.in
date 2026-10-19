import { describe, expect, it } from "vitest";

import { FACT_DOT } from "@/lib/format/join";

import {
    bookedLine,
    lengthLine,
    nobodyTakesLine,
    servicesCount,
    TAKING_LABEL,
    takingToast,
} from "./service-cards";

type Row = Parameters<typeof lengthLine>[0];

const row = (over: Partial<Row> = {}): Row => ({
    status: "ACTIVE",
    showOnBookingPage: true,
    durationMinutes: 60,
    bufferAfterMinutes: 15,
    capacity: 1,
    locationType: "IN_PERSON",
    ...over,
});

/** Facts as the rows join them: the dot held by no-break spaces. */
const facts = (...parts: string[]) => parts.join(FACT_DOT);

describe("servicesCount", () => {
    it("is one count, and nothing at zero", () => {
        expect(servicesCount([row(), row()], true)).toBe("2 services");
        expect(servicesCount([row()], null)).toBe("1 service");
        expect(servicesCount([], true)).toBeUndefined();
    });

    it("says how many the booking page offers only when that differs", () => {
        const list = [
            row(),
            row({ showOnBookingPage: false }),
            row({ status: "ARCHIVED" }),
        ];
        expect(servicesCount(list, true)).toBe(
            facts("3 services", "1 on the booking page"),
        );
        // Never the same number twice ("5 services", "5 on the booking page").
        expect(servicesCount([row(), row()], true)).not.toContain(
            "on the booking page",
        );
    });

    it("says there is no booking page yet", () => {
        expect(servicesCount([row()], false)).toBe(
            facts("1 service", "no booking page yet"),
        );
    });
});

describe("lengthLine", () => {
    it("says the length, the gap, where and the kind on one line", () => {
        expect(lengthLine(row())).toBe(
            facts("60 min", "15 min break after", "In person", "One person"),
        );
        expect(lengthLine(row({ locationType: "ONLINE" }))).toBe(
            facts("60 min", "15 min break after", "Online", "One person"),
        );
    });

    it("leaves no gap unsaid, and gives a class its places", () => {
        expect(
            lengthLine(
                row({
                    locationType: "EITHER",
                    capacity: 12,
                    bufferAfterMinutes: 0,
                }),
            ),
        ).toBe(
            facts(
                "60 min",
                "In person or online",
                "A group class",
                "12 places",
            ),
        );
    });

    it("says a treatment's visits (E10)", () => {
        expect(lengthLine(row({ visits: 3 }))).toBe(
            facts(
                "3 visits of 60 min",
                "15 min break after",
                "In person",
                "One person",
            ),
        );
        expect(lengthLine(row({ visits: 1 }))).toContain("60 min");
        expect(lengthLine(row({ visits: 1 }))).not.toContain("visits");
    });
});

describe("bookedLine", () => {
    it("says how it is booked, and a failed count as such", () => {
        expect(bookedLine(row(), { thisWeek: 3, comingUp: 5 })).toBe(
            facts("3 booked this week", "5 still to come"),
        );
        expect(bookedLine(row(), { thisWeek: 0, comingUp: 2 })).toBe(
            facts("0 booked this week", "2 still to come"),
        );
        expect(bookedLine(row(), null)).toBe("Bookings couldn't be counted");
        expect(bookedLine(row(), undefined)).toBe(
            "Bookings couldn't be counted",
        );
    });

    it("says nothing when nothing is booked: never two zeroes", () => {
        expect(bookedLine(row(), { thisWeek: 0, comingUp: 0 })).toBe("");
    });

    it("says a staff-only service isn't on the booking page", () => {
        const staffOnly = row({ showOnBookingPage: false });
        expect(bookedLine(staffOnly, { thisWeek: 0, comingUp: 1 })).toBe(
            facts(
                "Staff only, not on the booking page",
                "0 booked this week",
                "1 still to come",
            ),
        );
        expect(bookedLine(staffOnly, { thisWeek: 0, comingUp: 0 })).toBe(
            "Staff only, not on the booking page",
        );
    });

    it("says a paused service is off the booking page and keeps its bookings", () => {
        const paused = row({ status: "ARCHIVED" });
        expect(bookedLine(paused, { thisWeek: 0, comingUp: 0 })).toBe(
            "Hidden from the booking page",
        );
        expect(bookedLine(paused, { thisWeek: 0, comingUp: 1 })).toBe(
            "Hidden from the booking page. Its 1 booking still to come still happens",
        );
        expect(bookedLine(paused, { thisWeek: 0, comingUp: 2 })).toContain(
            "Its 2 bookings still to come still happen",
        );
    });
});

describe("nobodyTakesLine", () => {
    it("says nothing when every service has someone", () => {
        expect(nobodyTakesLine(0, 5, true)).toBeNull();
        expect(nobodyTakesLine(0, 0, false)).toBeNull();
    });

    it("with nobody on the diary, says it once and points at Availability", () => {
        expect(nobodyTakesLine(5, 5, false)).toEqual({
            line: "Nobody takes bookings yet, so each service books in its own hours.",
            toAvailability: true,
        });
        expect(nobodyTakesLine(1, 1, false)?.line).toBe(
            "Nobody takes bookings yet, so it books in its own hours.",
        );
    });

    it("with people on the diary, counts the services nobody takes", () => {
        expect(nobodyTakesLine(1, 5, true)).toEqual({
            line: "1 service has nobody to take it yet, so it books in its own hours. Open it to choose who takes it.",
            toAvailability: false,
        });
        expect(nobodyTakesLine(2, 5, true)?.line).toBe(
            "2 services have nobody to take them yet, so they book in their own hours. Open one to choose who takes it.",
        );
        expect(nobodyTakesLine(3, 3, true)?.line).toBe(
            "Nobody takes these yet, so they book in their own hours. Open one to choose who takes it.",
        );
    });
});

describe("the Taking bookings switch", () => {
    it("has one name, on or off, and says what flipping it did", () => {
        expect(TAKING_LABEL).toBe("Taking bookings");
        expect(takingToast("Yoga", true)).toBe(
            "Yoga paused. It's off the booking page. Bookings already made still happen.",
        );
        expect(takingToast("Yoga", false)).toBe("Yoga is bookable again.");
    });
});
