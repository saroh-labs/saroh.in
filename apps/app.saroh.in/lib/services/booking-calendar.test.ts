import { describe, expect, it } from "vitest";

import type { BookingsCalendar, DiaryBooking } from "./booking-calendar";
import { flattenCalendar } from "./booking-calendar";

function booking(id: string, startAt: string): DiaryBooking {
    return {
        id,
        serviceId: "svc_1",
        startAt,
        endAt: startAt,
        timezone: "Asia/Kolkata",
        status: "CONFIRMED",
        outcome: null,
        bookerName: null,
        bookerEmail: null,
        bookerPhone: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        cancelledAt: null,
        cancelledLate: false,
        service: {
            id: "svc_1",
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

describe("flattenCalendar", () => {
    it("gives the register every booking once — one-to-ones and class places — by slot", () => {
        const calendar: BookingsCalendar = {
            from: "2026-09-01T00:00:00.000Z",
            to: "2026-10-01T00:00:00.000Z",
            timezone: "Asia/Kolkata",
            money: false,
            diaries: [
                {
                    person: { id: "st_1", name: "Asha", title: null },
                    bookings: [booking("b3", "2026-09-03T04:00:00.000Z")],
                    classes: [
                        {
                            key: "svc_2@2026-09-02T01:00:00.000Z",
                            service: booking("x", "").service,
                            startAt: "2026-09-02T01:00:00.000Z",
                            endAt: "2026-09-02T01:45:00.000Z",
                            staff: { id: "st_1", name: "Asha" },
                            capacity: 12,
                            taken: 2,
                            bookings: [
                                booking("c1", "2026-09-02T01:00:00.000Z"),
                                booking("c2", "2026-09-02T01:00:00.000Z"),
                            ],
                        },
                    ],
                },
                {
                    person: null,
                    bookings: [booking("b1", "2026-09-01T04:00:00.000Z")],
                    classes: [],
                },
            ],
        };
        expect(flattenCalendar(calendar).map((b) => b.id)).toEqual([
            "b1",
            "c1",
            "c2",
            "b3",
        ]);
    });
});
