import { describe, expect, it } from "vitest";

import type { BookingsCalendar, DiaryBooking } from "./booking-calendar";
import { tallyUsage } from "./usage";

function booking(
    id: string,
    serviceId: string,
    startAt: string,
    status: DiaryBooking["status"] = "CONFIRMED",
): DiaryBooking {
    return {
        id,
        serviceId,
        startAt,
        endAt: startAt,
        timezone: "Asia/Kolkata",
        status,
        outcome: null,
        bookerName: null,
        bookerEmail: null,
        bookerPhone: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        cancelledAt: null,
        cancelledLate: false,
        service: {
            id: serviceId,
            name: "Spin",
            timezone: "Asia/Kolkata",
            capacity: 1,
            durationMinutes: 45,
        },
        contact: null,
        staff: null,
        paidWith: null,
        packName: null,
        subscriptionId: null,
    };
}

const now = Date.parse("2026-09-16T00:00:00.000Z");
const weekEnd = Date.parse("2026-09-20T18:30:00.000Z");

describe("tallyUsage", () => {
    it("counts this week and still to come, leaving cancelled out", () => {
        const calendar: BookingsCalendar = {
            from: "2026-09-13T18:30:00.000Z",
            to: "2026-12-15T18:30:00.000Z",
            timezone: "Asia/Kolkata",
            money: false,
            diaries: [
                {
                    person: null,
                    bookings: [
                        // Earlier this week: this week, not to come.
                        booking("b1", "sv_a", "2026-09-15T04:00:00.000Z"),
                        // Later this week: both.
                        booking("b2", "sv_a", "2026-09-18T04:00:00.000Z"),
                        // Next month: to come only.
                        booking("b3", "sv_a", "2026-10-02T04:00:00.000Z"),
                        booking(
                            "b4",
                            "sv_a",
                            "2026-09-18T05:00:00.000Z",
                            "CANCELLED",
                        ),
                    ],
                    classes: [
                        {
                            key: "k1",
                            service: booking("x", "sv_c", "").service,
                            startAt: "2026-09-17T01:00:00.000Z",
                            endAt: "2026-09-17T01:45:00.000Z",
                            staff: null,
                            capacity: 12,
                            taken: 2,
                            bookings: [
                                booking(
                                    "c1",
                                    "sv_c",
                                    "2026-09-17T01:00:00.000Z",
                                ),
                                booking(
                                    "c2",
                                    "sv_c",
                                    "2026-09-17T01:00:00.000Z",
                                ),
                                booking(
                                    "c3",
                                    "sv_c",
                                    "2026-09-17T01:00:00.000Z",
                                    "CANCELLED",
                                ),
                            ],
                        },
                        {
                            key: "k2",
                            service: booking("x", "sv_c", "").service,
                            startAt: "2026-09-24T01:00:00.000Z",
                            endAt: "2026-09-24T01:45:00.000Z",
                            staff: null,
                            capacity: 12,
                            taken: 0,
                            bookings: [],
                        },
                    ],
                },
            ],
        };
        expect(
            tallyUsage(calendar, ["sv_a", "sv_c", "sv_none"], { now, weekEnd }),
        ).toEqual({
            sv_a: { thisWeek: 2, comingUp: 2 },
            // Places held this week; one start still to come (an empty one isn't).
            sv_c: { thisWeek: 2, comingUp: 1 },
            sv_none: { thisWeek: 0, comingUp: 0 },
        });
    });
});
