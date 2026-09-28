import type {
    AvailabilityRuleWindow,
    AvailabilityService,
    Interval,
    StaffAvailabilityInput,
} from "./availability";
import {
    availableSlots,
    countOverlapping,
    enumerateSlots,
    guarded,
    guardMinutes,
    intersectIntervals,
    isPersonSlotStart,
    isValidSlotStart,
    mergeIntervals,
    outsideClosures,
    overlaps,
    personSlots,
    staffSlots,
    stepMinutes,
    subtractIntervals,
    workingIntervals,
} from "./availability";

/** A UTC service (no DST) unless a test overrides the timezone. */
function svc(over: Partial<AvailabilityService> = {}): AvailabilityService {
    return {
        durationMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        capacity: 1,
        timezone: "UTC",
        ...over,
    };
}

function rule(
    dayOfWeek: number,
    startMinute: number,
    endMinute: number,
): AvailabilityRuleWindow {
    return { dayOfWeek, startMinute, endMinute };
}

const iso = (s: string) => new Date(s);
const startISOs = (slots: { startAt: Date }[]) =>
    slots.map((s) => s.startAt.toISOString());

// 2026-07-20 is a Monday (schema dayOfWeek 1); 2026-07-21 a Tuesday.
const MON = {
    from: iso("2026-07-20T00:00:00Z"),
    to: iso("2026-07-21T00:00:00Z"),
};

describe("enumerateSlots — rule windows → absolute UTC slots", () => {
    it("steps by durationMinutes across a window, fully inside it", () => {
        // Mon 09:00–11:00, 30-min slots → 09:00, 09:30, 10:00, 10:30.
        const slots = enumerateSlots(
            svc({ durationMinutes: 30 }),
            [rule(1, 540, 660)],
            MON.from,
            MON.to,
        );
        expect(startISOs(slots)).toEqual([
            "2026-07-20T09:00:00.000Z",
            "2026-07-20T09:30:00.000Z",
            "2026-07-20T10:00:00.000Z",
            "2026-07-20T10:30:00.000Z",
        ]);
        // Each slot is exactly durationMinutes long and the last ends at the window edge.
        expect(slots[slots.length - 1].endAt.toISOString()).toBe(
            "2026-07-20T11:00:00.000Z",
        );
    });

    it("emits nothing for a day with no matching rule", () => {
        // Rule is for Sunday (0); the range is a Monday.
        const slots = enumerateSlots(
            svc(),
            [rule(0, 540, 660)],
            MON.from,
            MON.to,
        );
        expect(slots).toHaveLength(0);
    });

    it("drops a trailing partial slot that would exceed the window", () => {
        // Mon 09:00–10:10 (70 min), 30-min slots → 09:00, 09:30 only (10:00+30 > 10:10).
        const slots = enumerateSlots(
            svc({ durationMinutes: 30 }),
            [rule(1, 540, 610)],
            MON.from,
            MON.to,
        );
        expect(startISOs(slots)).toEqual([
            "2026-07-20T09:00:00.000Z",
            "2026-07-20T09:30:00.000Z",
        ]);
    });

    it("throws on an invalid IANA timezone", () => {
        expect(() =>
            enumerateSlots(
                svc({ timezone: "Mars/Phobos" }),
                [rule(1, 540, 600)],
                MON.from,
                MON.to,
            ),
        ).toThrow(/timezone/i);
    });
});

describe("enumerateSlots — DST correctness (America/New_York)", () => {
    // US spring-forward is 2026-03-08. The SAME local 09:00 Sunday slot must
    // resolve to a DIFFERENT absolute UTC instant before vs after the switch:
    // 14:00Z under EST (UTC-5) and 13:00Z under EDT (UTC-4).
    const ny = svc({ durationMinutes: 60, timezone: "America/New_York" });
    const sundayRule = [rule(0, 540, 600)]; // Sunday 09:00–10:00 local

    it("09:00 local on a pre-DST Sunday (2026-03-01) is 14:00Z (EST)", () => {
        const slots = enumerateSlots(
            ny,
            sundayRule,
            iso("2026-03-01T00:00:00Z"),
            iso("2026-03-02T00:00:00Z"),
        );
        expect(startISOs(slots)).toEqual(["2026-03-01T14:00:00.000Z"]);
    });

    it("09:00 local on a post-DST Sunday (2026-03-15) is 13:00Z (EDT)", () => {
        const slots = enumerateSlots(
            ny,
            sundayRule,
            iso("2026-03-15T00:00:00Z"),
            iso("2026-03-16T00:00:00Z"),
        );
        expect(startISOs(slots)).toEqual(["2026-03-15T13:00:00.000Z"]);
    });
});

describe("enumerateSlots — buffers and the half-hour step", () => {
    it("steps a length plus buffers of 45 every half hour (DEC-052)", () => {
        // duration 30, before 10, after 5 → 45, capped at 30. Window Mon
        // 09:00–11:00. The buffers are kept clear by the overlap check now.
        const slots = enumerateSlots(
            svc({
                durationMinutes: 30,
                bufferBeforeMinutes: 10,
                bufferAfterMinutes: 5,
            }),
            [rule(1, 540, 660)],
            MON.from,
            MON.to,
        );
        expect(startISOs(slots)).toEqual([
            "2026-07-20T09:00:00.000Z",
            "2026-07-20T09:30:00.000Z",
            "2026-07-20T10:00:00.000Z",
            "2026-07-20T10:30:00.000Z",
        ]);
    });
});

describe("overlaps / countOverlapping", () => {
    const slot: Interval = {
        startAt: iso("2026-07-20T09:00:00Z"),
        endAt: iso("2026-07-20T09:30:00Z"),
    };

    it("half-open intervals: touching at the edge do NOT overlap", () => {
        const abutting: Interval = {
            startAt: iso("2026-07-20T09:30:00Z"),
            endAt: iso("2026-07-20T10:00:00Z"),
        };
        expect(overlaps(slot, abutting)).toBe(false);
    });

    it("counts only genuinely overlapping intervals", () => {
        const bookings: Interval[] = [
            {
                startAt: iso("2026-07-20T09:15:00Z"),
                endAt: iso("2026-07-20T09:45:00Z"),
            }, // overlaps
            {
                startAt: iso("2026-07-20T09:30:00Z"),
                endAt: iso("2026-07-20T10:00:00Z"),
            }, // abuts, no overlap
        ];
        expect(countOverlapping(slot, bookings)).toBe(1);
    });
});

describe("availableSlots — capacity gating", () => {
    const rules = [rule(1, 540, 660)]; // 09:00–11:00, 30-min slots

    it("excludes a slot at/over capacity, keeps the rest", () => {
        // One confirmed booking 09:00–09:30 fills the capacity-1 first slot.
        const confirmed: Interval[] = [
            {
                startAt: iso("2026-07-20T09:00:00Z"),
                endAt: iso("2026-07-20T09:30:00Z"),
            },
        ];
        const open = availableSlots(
            svc({ capacity: 1 }),
            rules,
            MON.from,
            MON.to,
            confirmed,
        );
        expect(startISOs(open)).toEqual([
            "2026-07-20T09:30:00.000Z",
            "2026-07-20T10:00:00.000Z",
            "2026-07-20T10:30:00.000Z",
        ]);
    });

    it("keeps a slot below capacity (capacity 2, one booking)", () => {
        const confirmed: Interval[] = [
            {
                startAt: iso("2026-07-20T09:00:00Z"),
                endAt: iso("2026-07-20T09:30:00Z"),
            },
        ];
        const open = availableSlots(
            svc({ capacity: 2 }),
            rules,
            MON.from,
            MON.to,
            confirmed,
        );
        // The 09:00 slot still has room (1 < 2).
        expect(startISOs(open)).toContain("2026-07-20T09:00:00.000Z");
    });
});

describe("isValidSlotStart", () => {
    const rules = [rule(1, 540, 600)]; // Mon 09:00–10:00, 60-min slot

    it("accepts an aligned slot start", () => {
        expect(
            isValidSlotStart(
                svc({ durationMinutes: 60 }),
                rules,
                iso("2026-07-20T09:00:00Z"),
            ),
        ).toBe(true);
    });

    it("rejects an off-grid instant", () => {
        expect(
            isValidSlotStart(
                svc({ durationMinutes: 60 }),
                rules,
                iso("2026-07-20T09:15:00Z"),
            ),
        ).toBe(false);
    });

    it("rejects an instant on a day with no rule", () => {
        expect(
            isValidSlotStart(
                svc({ durationMinutes: 60 }),
                rules,
                iso("2026-07-21T09:00:00Z"), // Tuesday
            ),
        ).toBe(false);
    });
});

// ── Per-person availability (U3) ───────────────────────────────────────────

const HOUR = 60;

/** A person with Mon 6:00–12:00 and nothing else, unless a test says. */
function person(
    id: string,
    over: Partial<StaffAvailabilityInput> = {},
): StaffAvailabilityInput {
    return {
        id,
        hours: [rule(1, 6 * HOUR, 12 * HOUR)],
        extraHours: [],
        timeOff: [],
        busy: [],
        ...over,
    };
}

const ONE_HOUR = svc({ durationMinutes: 60 });

describe("interval helpers", () => {
    const i = (a: string, b: string): Interval => ({
        startAt: iso(a),
        endAt: iso(b),
    });

    it("merges overlapping and touching intervals", () => {
        const merged = mergeIntervals([
            i("2026-07-20T10:00:00Z", "2026-07-20T11:00:00Z"),
            i("2026-07-20T09:00:00Z", "2026-07-20T10:00:00Z"),
            i("2026-07-20T10:30:00Z", "2026-07-20T12:00:00Z"),
        ]);
        expect(merged).toEqual([
            i("2026-07-20T09:00:00Z", "2026-07-20T12:00:00Z"),
        ]);
    });

    it("subtracts a hole out of the middle", () => {
        expect(
            subtractIntervals(
                [i("2026-07-20T06:00:00Z", "2026-07-20T12:00:00Z")],
                [i("2026-07-20T08:00:00Z", "2026-07-20T09:00:00Z")],
            ),
        ).toEqual([
            i("2026-07-20T06:00:00Z", "2026-07-20T08:00:00Z"),
            i("2026-07-20T09:00:00Z", "2026-07-20T12:00:00Z"),
        ]);
    });

    it("intersects two sets", () => {
        expect(
            intersectIntervals(
                [i("2026-07-20T06:00:00Z", "2026-07-20T12:00:00Z")],
                [
                    i("2026-07-20T05:00:00Z", "2026-07-20T07:00:00Z"),
                    i("2026-07-20T09:00:00Z", "2026-07-20T17:00:00Z"),
                ],
            ),
        ).toEqual([
            i("2026-07-20T06:00:00Z", "2026-07-20T07:00:00Z"),
            i("2026-07-20T09:00:00Z", "2026-07-20T12:00:00Z"),
        ]);
    });
});

describe("staffSlots — free times per person (U3)", () => {
    it("offers 6:00, 6:30 … 11:00 starts for Mon 6–12 and a 60-minute service", () => {
        const slots = staffSlots(
            ONE_HOUR,
            [],
            [person("asha")],
            "UTC",
            MON.from,
            MON.to,
        );
        expect(startISOs(slots)).toEqual([
            "2026-07-20T06:00:00.000Z",
            "2026-07-20T06:30:00.000Z",
            "2026-07-20T07:00:00.000Z",
            "2026-07-20T07:30:00.000Z",
            "2026-07-20T08:00:00.000Z",
            "2026-07-20T08:30:00.000Z",
            "2026-07-20T09:00:00.000Z",
            "2026-07-20T09:30:00.000Z",
            "2026-07-20T10:00:00.000Z",
            "2026-07-20T10:30:00.000Z",
            "2026-07-20T11:00:00.000Z",
        ]);
        expect(slots.every((s) => s.staffIds.join() === "asha")).toBe(true);
    });

    it("a booking at 7:00 takes 7:00 away from that person only", () => {
        const booked: Interval = {
            startAt: iso("2026-07-20T07:00:00Z"),
            endAt: iso("2026-07-20T08:00:00Z"),
        };
        const slots = staffSlots(
            ONE_HOUR,
            [],
            [person("asha", { busy: [booked] }), person("ben")],
            "UTC",
            MON.from,
            MON.to,
        );
        const seven = slots.find(
            (s) => s.startAt.toISOString() === "2026-07-20T07:00:00.000Z",
        );
        expect(seven?.staffIds).toEqual(["ben"]);
        const six = slots.find(
            (s) => s.startAt.toISOString() === "2026-07-20T06:00:00.000Z",
        );
        expect(six?.staffIds).toEqual(["asha", "ben"]);
    });

    it("a booking on another service blocks the person too (busy is any service)", () => {
        // The caller loads busy from every service; one 30-minute booking at
        // 9:15 knocks out both hours it touches.
        const slots = personSlots(
            ONE_HOUR,
            [],
            person("asha", {
                busy: [
                    {
                        startAt: iso("2026-07-20T09:15:00Z"),
                        endAt: iso("2026-07-20T09:45:00Z"),
                    },
                ],
            }),
            "UTC",
            MON.from,
            MON.to,
        );
        expect(startISOs(slots)).not.toContain("2026-07-20T09:00:00.000Z");
        expect(startISOs(slots)).toContain("2026-07-20T10:00:00.000Z");
    });

    it("time off on a date removes all of that person's slots that day", () => {
        const slots = personSlots(
            ONE_HOUR,
            [],
            person("asha", {
                timeOff: [
                    {
                        startAt: iso("2026-07-20T00:00:00Z"),
                        endAt: iso("2026-07-21T00:00:00Z"),
                    },
                ],
            }),
            "UTC",
            MON.from,
            MON.to,
        );
        expect(slots).toEqual([]);
    });

    it("part-day time off removes only what it covers", () => {
        const slots = personSlots(
            ONE_HOUR,
            [],
            person("asha", {
                timeOff: [
                    {
                        startAt: iso("2026-07-20T08:00:00Z"),
                        endAt: iso("2026-07-20T10:00:00Z"),
                    },
                ],
            }),
            "UTC",
            MON.from,
            MON.to,
        );
        expect(startISOs(slots)).toEqual([
            "2026-07-20T06:00:00.000Z",
            "2026-07-20T06:30:00.000Z",
            "2026-07-20T07:00:00.000Z",
            "2026-07-20T10:00:00.000Z",
            "2026-07-20T10:30:00.000Z",
            "2026-07-20T11:00:00.000Z",
        ]);
    });

    it("extra hours on a closed day add slots on that date only", () => {
        // Tuesday is closed; 2026-07-21 gets 14:00–16:00, 2026-07-28 does not.
        const asha = person("asha", {
            extraHours: [
                {
                    date: "2026-07-21",
                    startMinute: 14 * HOUR,
                    endMinute: 16 * HOUR,
                },
            ],
        });
        const slots = personSlots(
            ONE_HOUR,
            [],
            asha,
            "UTC",
            iso("2026-07-21T00:00:00Z"),
            iso("2026-07-29T00:00:00Z"),
        );
        const tuesdays = startISOs(slots).filter((s) =>
            ["2026-07-21", "2026-07-28"].includes(s.slice(0, 10)),
        );
        expect(tuesdays).toEqual([
            "2026-07-21T14:00:00.000Z",
            "2026-07-21T14:30:00.000Z",
            "2026-07-21T15:00:00.000Z",
        ]);
    });

    it("intersects with the service's own rules when both exist", () => {
        // Person 6–12, service 9–17 → 9:00, 9:30 … 11:00.
        const slots = personSlots(
            ONE_HOUR,
            [rule(1, 9 * HOUR, 17 * HOUR)],
            person("asha"),
            "UTC",
            MON.from,
            MON.to,
        );
        expect(startISOs(slots)).toEqual([
            "2026-07-20T09:00:00.000Z",
            "2026-07-20T09:30:00.000Z",
            "2026-07-20T10:00:00.000Z",
            "2026-07-20T10:30:00.000Z",
            "2026-07-20T11:00:00.000Z",
        ]);
    });

    it("keeps business-local hours right across a DST change", () => {
        // New York springs forward on Sun 2026-03-08. Mon 9:00 local is
        // 14:00Z the week before and 13:00Z the week after.
        const zone = "America/New_York";
        const asha = person("asha", { hours: [rule(1, 9 * HOUR, 10 * HOUR)] });
        const slots = personSlots(
            svc({ durationMinutes: 60, timezone: zone }),
            [],
            asha,
            zone,
            iso("2026-03-02T00:00:00Z"),
            iso("2026-03-10T00:00:00Z"),
        );
        expect(startISOs(slots)).toEqual([
            "2026-03-02T14:00:00.000Z",
            "2026-03-09T13:00:00.000Z",
        ]);
    });

    it("works out working time in the business's zone, not UTC", () => {
        const windows = workingIntervals(
            person("asha", { hours: [rule(1, 6 * HOUR, 12 * HOUR)] }),
            "Asia/Kolkata",
            MON.from,
            MON.to,
        );
        // Mon 06:00 IST is 00:30Z.
        expect(
            windows.some(
                (w) => w.startAt.toISOString() === "2026-07-20T00:30:00.000Z",
            ),
        ).toBe(true);
    });
});

describe("isPersonSlotStart", () => {
    it("accepts one of the person's free starts", () => {
        expect(
            isPersonSlotStart(
                ONE_HOUR,
                [],
                person("asha"),
                "UTC",
                iso("2026-07-20T07:00:00Z"),
            ),
        ).toBe(true);
    });

    it("refuses a start the person is booked at", () => {
        const asha = person("asha", {
            busy: [
                {
                    startAt: iso("2026-07-20T07:00:00Z"),
                    endAt: iso("2026-07-20T08:00:00Z"),
                },
            ],
        });
        expect(
            isPersonSlotStart(
                ONE_HOUR,
                [],
                asha,
                "UTC",
                iso("2026-07-20T07:00:00Z"),
            ),
        ).toBe(false);
    });

    it("refuses a start outside their hours, or off the grid", () => {
        expect(
            isPersonSlotStart(
                ONE_HOUR,
                [],
                person("asha"),
                "UTC",
                iso("2026-07-20T12:00:00Z"),
            ),
        ).toBe(false);
        expect(
            isPersonSlotStart(
                ONE_HOUR,
                [],
                person("asha"),
                "UTC",
                iso("2026-07-20T06:15:00Z"),
            ),
        ).toBe(false);
    });
});

// ── Business closures (E3) ────────────────────────────────────────────────

describe("outsideClosures — the whole business closed", () => {
    // Every day 09:00–12:00, one-hour slots.
    const everyDay = Array.from({ length: 7 }, (_, d) =>
        rule(d, 9 * HOUR, 12 * HOUR),
    );
    const week = {
        from: iso("2026-11-01T00:00:00Z"),
        to: iso("2026-11-09T00:00:00Z"),
    };

    it("removes every slot on the closed days and none either side", () => {
        const slots = enumerateSlots(ONE_HOUR, everyDay, week.from, week.to);
        const closed = [
            {
                startAt: iso("2026-11-02T00:00:00Z"),
                endAt: iso("2026-11-07T00:00:00Z"),
            },
        ];
        const open = outsideClosures(slots, closed);
        const days = [
            ...new Set(open.map((s) => s.startAt.toISOString().slice(0, 10))),
        ];
        expect(days).toEqual(["2026-11-01", "2026-11-07", "2026-11-08"]);
        // 09:00, 09:30 … 11:00 on each of the three open days.
        expect(open).toHaveLength(15);
    });

    it("takes out only the closed hours of a part-day closure, on the grid", () => {
        const slots = enumerateSlots(
            ONE_HOUR,
            [rule(1, 9 * HOUR, 18 * HOUR)],
            iso("2026-11-02T00:00:00Z"),
            iso("2026-11-03T00:00:00Z"),
        );
        const open = outsideClosures(slots, [
            {
                startAt: iso("2026-11-02T14:00:00Z"),
                endAt: iso("2026-11-02T16:30:00Z"),
            },
        ]);
        // 16:00 overlaps the closure's last half hour; 16:30 is after it.
        expect(startISOs(open).map((s) => s.slice(11, 16))).toEqual([
            "09:00",
            "09:30",
            "10:00",
            "10:30",
            "11:00",
            "11:30",
            "12:00",
            "12:30",
            "13:00",
            "16:30",
            "17:00",
        ]);
    });

    it("closes a whole local day across a DST change in a non-India zone", () => {
        // 1 Nov 2026 in New York is 25 hours long (EDT to EST).
        const ny = svc({ durationMinutes: 60, timezone: "America/New_York" });
        const slots = enumerateSlots(
            ny,
            [rule(0, 0, 24 * HOUR)],
            iso("2026-11-01T00:00:00Z"),
            iso("2026-11-03T00:00:00Z"),
        );
        const open = outsideClosures(slots, [
            {
                startAt: iso("2026-11-01T04:00:00Z"),
                endAt: iso("2026-11-02T05:00:00Z"),
            },
        ]);
        expect(slots.length).toBeGreaterThan(0);
        expect(open).toHaveLength(0);
    });

    it("leaves slots alone when nothing is closed", () => {
        const slots = enumerateSlots(ONE_HOUR, everyDay, week.from, week.to);
        expect(outsideClosures(slots, [])).toBe(slots);
    });

    it("closes a person's one-to-one starts when it is their time off", () => {
        const open = personSlots(
            ONE_HOUR,
            [],
            person("asha", {
                timeOff: [
                    {
                        startAt: iso("2026-07-20T08:00:00Z"),
                        endAt: iso("2026-07-20T10:00:00Z"),
                    },
                ],
            }),
            "UTC",
            MON.from,
            MON.to,
        );
        expect(startISOs(open).map((s) => s.slice(11, 16))).toEqual([
            "06:00",
            "06:30",
            "07:00",
            "10:00",
            "10:30",
            "11:00",
        ]);
    });
});

// ── Half-hour starts (DEC-052, E6) ──────────────────────────────────────────

describe("half-hour starts — a service of 30 minutes or more (DEC-052)", () => {
    const hhmm = (slots: { startAt: Date }[]) =>
        startISOs(slots).map((s) => s.slice(11, 16));
    const nineToNoon = [rule(1, 9 * HOUR, 12 * HOUR)];

    it("a 60-minute service in 09:00–12:00 offers 09:00, 09:30 … 11:00", () => {
        const slots = enumerateSlots(
            svc({ durationMinutes: 60 }),
            nineToNoon,
            MON.from,
            MON.to,
        );
        expect(hhmm(slots)).toEqual([
            "09:00",
            "09:30",
            "10:00",
            "10:30",
            "11:00",
        ]);
    });

    it("a 20-minute service keeps its own step: 09:00, 09:20, 09:40", () => {
        const slots = enumerateSlots(
            svc({ durationMinutes: 20 }),
            [rule(1, 9 * HOUR, 10 * HOUR)],
            MON.from,
            MON.to,
        );
        expect(hhmm(slots)).toEqual(["09:00", "09:20", "09:40"]);
    });

    it("a 30-minute service is unchanged", () => {
        const slots = enumerateSlots(
            svc({ durationMinutes: 30 }),
            [rule(1, 9 * HOUR, 10 * HOUR + 30)],
            MON.from,
            MON.to,
        );
        expect(hhmm(slots)).toEqual(["09:00", "09:30", "10:00"]);
        expect(stepMinutes(svc({ durationMinutes: 30 }))).toBe(30);
    });

    it("a class keeps its back-to-back sessions", () => {
        const slots = enumerateSlots(
            svc({ durationMinutes: 60, capacity: 12 }),
            nineToNoon,
            MON.from,
            MON.to,
        );
        expect(hhmm(slots)).toEqual(["09:00", "10:00", "11:00"]);
    });

    it("steps from the window's start, never the clock: 09:15, 09:45", () => {
        const slots = enumerateSlots(
            svc({ durationMinutes: 60 }),
            [rule(1, 9 * HOUR + 15, 11 * HOUR + 15)],
            MON.from,
            MON.to,
        );
        expect(hhmm(slots)).toEqual(["09:15", "09:45", "10:15"]);
    });

    it("never offers fewer starts, and keeps today's where the length plus buffers is a multiple of 30", () => {
        // Every length the showcase seeds (Pulse, Kavi, Northwind, and the
        // demo stores), with and without buffers.
        const lengths = [10, 15, 20, 30, 45, 60, 75, 90, 120];
        const bufferPairs: [number, number][] = [
            [0, 0],
            [0, 15],
            [10, 5],
        ];
        const window = [rule(1, 6 * HOUR, 21 * HOUR)];
        for (const durationMinutes of lengths) {
            for (const [
                bufferBeforeMinutes,
                bufferAfterMinutes,
            ] of bufferPairs) {
                const service = svc({
                    durationMinutes,
                    bufferBeforeMinutes,
                    bufferAfterMinutes,
                });
                const now = startISOs(
                    enumerateSlots(service, window, MON.from, MON.to),
                );
                // What it offered before E6: stepping by length + buffers.
                const whole =
                    durationMinutes + bufferBeforeMinutes + bufferAfterMinutes;
                const before: string[] = [];
                for (
                    let m = 6 * 60;
                    m + durationMinutes <= 21 * 60;
                    m += whole
                ) {
                    before.push(
                        new Date(MON.from.getTime() + m * 60_000).toISOString(),
                    );
                }
                expect(now.length).toBeGreaterThanOrEqual(before.length);
                if (whole % 30 === 0 || whole < 30) {
                    for (const start of before) expect(now).toContain(start);
                }
            }
        }
    });

    it("a 60-minute service with 15 minutes after, booked at 09:00, offers 10:30 next — the buffer is kept clear", () => {
        const service = svc({ durationMinutes: 60, bufferAfterMinutes: 15 });
        const booked: Interval[] = [
            {
                startAt: iso("2026-07-20T09:00:00Z"),
                endAt: iso("2026-07-20T10:00:00Z"),
            },
        ];
        const open = availableSlots(
            service,
            [rule(1, 9 * HOUR, 13 * HOUR)],
            MON.from,
            MON.to,
            booked,
        );
        expect(hhmm(open)).toEqual(["10:30", "11:00", "11:30", "12:00"]);
    });

    it("keeps the buffer clear before a booking too", () => {
        // Booked 11:00–12:00; a 60-minute start at 10:00 would end at 11:00
        // and its 15 minutes after would run into it.
        const service = svc({ durationMinutes: 60, bufferAfterMinutes: 15 });
        const open = availableSlots(
            service,
            [rule(1, 9 * HOUR, 13 * HOUR)],
            MON.from,
            MON.to,
            [
                {
                    startAt: iso("2026-07-20T11:00:00Z"),
                    endAt: iso("2026-07-20T12:00:00Z"),
                },
            ],
        );
        expect(hhmm(open)).toEqual(["09:00", "09:30"]);
    });

    it("a person's buffers are kept clear too, on any service", () => {
        const service = svc({ durationMinutes: 60, bufferAfterMinutes: 15 });
        const slots = personSlots(
            service,
            [],
            person("asha", {
                busy: [
                    {
                        startAt: iso("2026-07-20T09:00:00Z"),
                        endAt: iso("2026-07-20T10:00:00Z"),
                    },
                ],
            }),
            "UTC",
            MON.from,
            MON.to,
        );
        expect(hhmm(slots)).not.toContain("10:00");
        expect(hhmm(slots)).toContain("10:30");
    });

    it("a 60-minute booking takes the half hours either side of it", () => {
        const open = availableSlots(
            svc({ durationMinutes: 60 }),
            nineToNoon,
            MON.from,
            MON.to,
            [
                {
                    startAt: iso("2026-07-20T10:00:00Z"),
                    endAt: iso("2026-07-20T11:00:00Z"),
                },
            ],
        );
        expect(hhmm(open)).toEqual(["09:00", "11:00"]);
    });

    it("accepts a half-hour start as a real slot, and still refuses one off the grid", () => {
        const service = svc({ durationMinutes: 60 });
        expect(
            isValidSlotStart(service, nineToNoon, iso("2026-07-20T09:30:00Z")),
        ).toBe(true);
        expect(
            isValidSlotStart(service, nineToNoon, iso("2026-07-20T09:15:00Z")),
        ).toBe(false);
    });

    it("guards a slot by both buffers either side, and not at all without them", () => {
        const slot = {
            startAt: iso("2026-07-20T10:00:00Z"),
            endAt: iso("2026-07-20T11:00:00Z"),
        };
        const service = svc({
            durationMinutes: 60,
            bufferBeforeMinutes: 10,
            bufferAfterMinutes: 5,
        });
        expect(guardMinutes(service)).toBe(15);
        expect(guarded(slot, service)).toEqual({
            startAt: iso("2026-07-20T09:45:00Z"),
            endAt: iso("2026-07-20T11:15:00Z"),
        });
        expect(guarded(slot, svc())).toEqual(slot);
    });
});
