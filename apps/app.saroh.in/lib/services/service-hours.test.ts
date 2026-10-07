import { describe, expect, it } from "vitest";

import type { BookingsCalendar } from "./booking-calendar";
import { dayColumns, SERVICE_HOURS_NAME } from "./diary";
import type { Service } from "./service";
import { bookableOwnHours, serviceHoursOf } from "./service-hours";

/**
 * With nobody on the diary the calendar agrees with the booking page
 * (UX-023): customers book each service in its own hours, so the day draws
 * them as free time, not a day hatched closed.
 */

const RULE = {
    id: "r1",
    serviceId: "svc_1",
    dayOfWeek: 4, // Thursday
    startMinute: 600,
    endMinute: 1080,
};

const EMPTY: BookingsCalendar = {
    timezone: "Asia/Kolkata",
    diaries: [],
} as unknown as BookingsCalendar;

describe("the services' own hours on the calendar (UX-023)", () => {
    it("takes the active one-to-ones customers can book, not classes or hidden ones", () => {
        const base = {
            status: "ACTIVE",
            capacity: 1,
            showOnBookingPage: true,
        } as Service;
        const list = [
            { ...base, id: "a" },
            { ...base, id: "class", capacity: 8 },
            { ...base, id: "hidden", showOnBookingPage: false },
            { ...base, id: "paused", status: "ARCHIVED" } as unknown as Service,
        ];
        expect(bookableOwnHours(list).map((s) => s.id)).toEqual(["a"]);
    });

    it("is nothing when no service has hours", () => {
        expect(serviceHoursOf([[], null], [])).toBeNull();
    });

    it("draws one column of free time in them with nobody on the diary", () => {
        const hours = serviceHoursOf([[RULE]], []);
        const columns = dayColumns(
            EMPTY,
            [],
            "2026-10-08", // a Thursday
            "Asia/Kolkata",
            () => 0,
            undefined,
            hours,
        );
        expect(columns).toHaveLength(1);
        expect(columns[0]).toMatchObject({
            name: SERVICE_HOURS_NAME,
            day: { windows: [[600, 1080]], free: [[600, 1080]] },
        });
    });

    it("keeps the old empty diary without service hours", () => {
        expect(
            dayColumns(EMPTY, [], "2026-10-08", "Asia/Kolkata", () => 0),
        ).toEqual([]);
    });
});
