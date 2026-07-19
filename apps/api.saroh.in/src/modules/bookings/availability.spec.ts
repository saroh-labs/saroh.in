import type {
    AvailabilityRuleWindow,
    AvailabilityService,
    Interval,
} from "./availability";
import {
    availableSlots,
    countOverlapping,
    enumerateSlots,
    isValidSlotStart,
    overlaps,
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

describe("enumerateSlots — buffers space slots", () => {
    it("spaces consecutive starts by duration + both buffers", () => {
        // duration 30, before 10, after 5 → step 45. Window Mon 09:00–11:00.
        // Starts: 09:00, 09:45, 10:30 (10:30+30=11:00 fits; next 11:15 would not).
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
            "2026-07-20T09:45:00.000Z",
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
