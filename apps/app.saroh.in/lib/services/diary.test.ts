import { describe, expect, it } from "vitest";

import type { BookingsCalendar, DiaryBooking } from "./booking-calendar";
import {
    addDays,
    blocksOnDay,
    bookedValue,
    busySpans,
    clock,
    dayLabel,
    firstStartIn,
    localDateOf,
    localMinuteOf,
    mergeSpans,
    monthDays,
    personDay,
    subtractSpans,
    visibleHours,
    weekStartOf,
    zonedInstant,
} from "./diary";

const IST = "Asia/Kolkata";

function booking(
    id: string,
    startAt: string,
    minutes: number,
    extra: Partial<DiaryBooking> = {},
): DiaryBooking {
    return {
        id,
        serviceId: "svc_pt",
        startAt,
        endAt: new Date(Date.parse(startAt) + minutes * 60_000).toISOString(),
        timezone: IST,
        status: "CONFIRMED",
        outcome: null,
        bookerName: "Tariq Ali",
        bookerEmail: "tariq@example.com",
        bookerPhone: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        cancelledAt: null,
        cancelledLate: false,
        service: {
            id: "svc_pt",
            name: "Personal training",
            timezone: IST,
            capacity: 1,
            durationMinutes: minutes,
            priceCents: 120_000,
            currency: "INR",
        },
        contact: null,
        staff: { id: "st_vikram", name: "Vikram" },
        paidWith: "DESK",
        packName: null,
        subscriptionId: null,
        ...extra,
    };
}

const vikram = {
    // Mon 06:00–10:00 and 17:00–21:00.
    hours: [
        { dayOfWeek: 1, startMinute: 360, endMinute: 600 },
        { dayOfWeek: 1, startMinute: 1020, endMinute: 1260 },
    ],
    extraHours: [
        // Sunday 27 Sep, a closed day, opened 08:00–11:00.
        {
            id: "x1",
            date: "2026-09-27T00:00:00.000Z",
            startMinute: 480,
            endMinute: 660,
        },
    ],
    timeOff: [
        // Mon 28 Sep, all day, stored as the local day's instants.
        {
            id: "t1",
            startAt: "2026-09-27T18:30:00.000Z",
            endAt: "2026-09-28T18:30:00.000Z",
            allDay: true,
            reason: "Wedding",
        },
    ],
};

describe("zones", () => {
    it("finds the instant of a local time and back", () => {
        const at = zonedInstant("2026-09-21", 7 * 60 + 15, IST);
        expect(at.toISOString()).toBe("2026-09-21T01:45:00.000Z");
        expect(localDateOf(at, IST)).toBe("2026-09-21");
        expect(localMinuteOf(at, IST)).toBe(435);
    });

    it("keeps wall-clock hours across a DST change", () => {
        // London goes to GMT on 25 Oct 2026: 09:00 is 08:00Z before, 09:00Z after.
        expect(
            zonedInstant("2026-10-24", 540, "Europe/London").toISOString(),
        ).toBe("2026-10-24T08:00:00.000Z");
        expect(
            zonedInstant("2026-10-26", 540, "Europe/London").toISOString(),
        ).toBe("2026-10-26T09:00:00.000Z");
    });
});

describe("calendar days", () => {
    it("steps days, finds the Monday and lays out a month", () => {
        expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
        expect(weekStartOf("2026-09-23")).toBe("2026-09-21");
        expect(weekStartOf("2026-09-27")).toBe("2026-09-21");
        const sep = monthDays("2026-09-18");
        expect(sep.days).toHaveLength(30);
        // 1 Sep 2026 is a Tuesday: one blank before it on a Monday grid.
        expect(sep.lead).toBe(1);
        expect(dayLabel("2026-09-18")).toBe("Fri 18 Sep");
        expect(clock(435)).toBe("07:15");
        expect(clock(1440)).toBe("24:00");
    });
});

describe("spans", () => {
    it("merges and subtracts stretches of a day", () => {
        expect(
            mergeSpans([
                [600, 660],
                [360, 600],
                [900, 960],
            ]),
        ).toEqual([
            [360, 660],
            [900, 960],
        ]);
        expect(
            subtractSpans(
                [[360, 600]],
                [
                    [420, 480],
                    [540, 700],
                ],
            ),
        ).toEqual([
            [360, 420],
            [480, 540],
        ]);
    });
});

describe("personDay", () => {
    it("offers what is left of the hours once bookings and their gaps are out", () => {
        const day = personDay(vikram, "2026-09-21", IST, [
            [360, 420 + 15],
            [480, 540],
        ]);
        expect(day.windows).toEqual([
            [360, 600],
            [1020, 1260],
        ]);
        expect(day.free).toEqual([
            [435, 480],
            [540, 600],
            [1020, 1260],
        ]);
    });

    it("does not offer a gap too short to book", () => {
        const day = personDay(vikram, "2026-09-21", IST, [
            [360, 590],
            [600, 1260],
        ]);
        expect(day.free).toEqual([]);
    });

    it("opens a closed day with its extra hours only on that date", () => {
        expect(personDay(vikram, "2026-09-27", IST, []).free).toEqual([
            [480, 660],
        ]);
        expect(personDay(vikram, "2026-09-20", IST, []).free).toEqual([]);
    });

    it("takes a day off out of everything", () => {
        const day = personDay(vikram, "2026-09-28", IST, []);
        expect(day.off).toEqual([[0, 1440]]);
        expect(day.windows).toEqual([]);
        expect(day.free).toEqual([]);
    });
});

describe("blocksOnDay", () => {
    const calendar: BookingsCalendar = {
        from: "2026-09-20T18:30:00.000Z",
        to: "2026-09-21T18:30:00.000Z",
        timezone: IST,
        money: true,
        diaries: [
            {
                person: { id: "st_vikram", name: "Vikram", title: "Trainer" },
                bookings: [
                    booking("b1", "2026-09-21T00:30:00.000Z", 60),
                    booking("b2", "2026-09-21T03:30:00.000Z", 60, {
                        status: "CANCELLED",
                    }),
                ],
                classes: [
                    {
                        key: "svc_hiit@2026-09-21T12:30:00.000Z",
                        service: {
                            id: "svc_hiit",
                            name: "HIIT circuit",
                            timezone: IST,
                            capacity: 16,
                            durationMinutes: 45,
                            priceCents: 40_000,
                            currency: "INR",
                        },
                        startAt: "2026-09-21T12:30:00.000Z",
                        endAt: "2026-09-21T13:15:00.000Z",
                        staff: { id: "st_vikram", name: "Vikram" },
                        capacity: 16,
                        taken: 2,
                        bookings: [
                            booking("c1", "2026-09-21T12:30:00.000Z", 45, {
                                serviceId: "svc_hiit",
                            }),
                            booking("c2", "2026-09-21T12:30:00.000Z", 45, {
                                serviceId: "svc_hiit",
                            }),
                            booking("c3", "2026-09-21T12:30:00.000Z", 45, {
                                serviceId: "svc_hiit",
                                status: "CANCELLED",
                            }),
                        ],
                    },
                ],
            },
            {
                person: null,
                bookings: [booking("u1", "2026-09-22T04:30:00.000Z", 60)],
                classes: [],
            },
        ],
    };

    it("puts each booking and class on its person's day, in local minutes", () => {
        const days = blocksOnDay(calendar, "2026-09-21", IST);
        const mine = days.get("st_vikram") ?? [];
        expect(mine.map((b) => [b.key, b.start, b.state])).toEqual([
            ["b1", 360, "booked"],
            ["b2", 540, "cancelled"],
            ["svc_hiit@2026-09-21T12:30:00.000Z", 1080, "open"],
        ]);
        // The Unassigned booking is on another day.
        expect(days.get("unassigned")).toEqual([]);
    });

    it("counts a cancelled booking as free time, and a class's gap after", () => {
        const mine = blocksOnDay(calendar, "2026-09-21", IST).get("st_vikram");
        expect(
            busySpans(mine ?? [], (id) => (id === "svc_pt" ? 15 : 0)),
        ).toEqual([
            [360, 435],
            [1080, 1125],
        ]);
    });

    it("adds up what the day has booked, classes by the place", () => {
        const mine =
            blocksOnDay(calendar, "2026-09-21", IST).get("st_vikram") ?? [];
        expect(bookedValue(mine, true)).toBe(120_000 + 2 * 40_000);
        expect(bookedValue(mine, false)).toBeNull();
    });
});

describe("visibleHours", () => {
    it("keeps 06:00–21:00 and widens it for anything outside", () => {
        expect(visibleHours([[420, 480]])).toEqual([360, 1260]);
        expect(
            visibleHours([
                [330, 400],
                [1250, 1300],
            ]),
        ).toEqual([300, 1320]);
    });
});

describe("firstStartIn", () => {
    it("takes the earliest offered start that fits inside the gap", () => {
        const starts = [
            { startAt: "2026-09-24T00:30:00.000Z" }, // 06:00, outside the gap
            { startAt: "2026-09-24T02:00:00.000Z" }, // 07:30
            { startAt: "2026-09-24T01:30:00.000Z" }, // 07:00
            { startAt: "2026-09-24T02:30:00.000Z" }, // 08:00, runs past it
        ];
        expect(firstStartIn(starts, [420, 525], 45, "2026-09-24", IST)).toBe(
            420,
        );
        expect(firstStartIn(starts, [430, 525], 45, "2026-09-24", IST)).toBe(
            450,
        );
        expect(
            firstStartIn(starts, [430, 470], 45, "2026-09-24", IST),
        ).toBeNull();
    });
});
