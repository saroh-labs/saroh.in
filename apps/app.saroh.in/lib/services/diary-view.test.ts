import { describe, expect, it } from "vitest";

import type { ClassSession, DiaryBooking } from "./booking-calendar";
import type { Block, Column } from "./diary";
import {
    closedKind,
    closedSpans,
    dayFullness,
    drawnLanes,
    everyoneFree,
    firstSight,
    hoursAcross,
    legendOf,
    offSpans,
    slotIn,
    toPay,
    toPayText,
    weekLanes,
} from "./diary-view";

/**
 * What the diary draws: closed time and time off inside the hours shown,
 * who still owes, where a tap in a free gap starts, and a legend that names
 * only what is on the view.
 */

const booking = (extra: Partial<DiaryBooking> = {}): DiaryBooking =>
    ({
        id: "b1",
        serviceId: "svc",
        status: "CONFIRMED",
        outcome: null,
        paidWith: "DESK",
        service: { id: "svc", name: "Cut", capacity: 1 },
        ...extra,
    }) as DiaryBooking;

const one = (
    key: string,
    start: number,
    end: number,
    extra: Partial<DiaryBooking> = {},
): Block => {
    const b = booking({ id: key, ...extra });
    return {
        kind: "one",
        key,
        start,
        end,
        state: b.status === "CANCELLED" ? "cancelled" : "booked",
        staffId: null,
        booking: b,
    };
};

const klass = (key: string, seats: DiaryBooking[]): Block => ({
    kind: "class",
    key,
    start: 600,
    end: 660,
    state: "open",
    staffId: null,
    session: {
        key,
        capacity: 8,
        taken: seats.length,
        bookings: seats,
        service: { id: "c", name: "Yoga", capacity: 8 },
    } as ClassSession,
});

describe("closed time and time off", () => {
    const day = {
        windows: [[540, 780] as const, [840, 1020] as const],
        off: [[780, 840] as const],
    };

    it("is closed where it is neither open nor off, inside the hours shown", () => {
        expect(closedSpans(day, [480, 1080])).toEqual([
            [480, 540],
            [1020, 1080],
        ]);
        expect(offSpans(day, [480, 1080])).toEqual([[780, 840]]);
    });

    it("clips an all-day time off to the hours shown, and hatches it once", () => {
        const off = { windows: [], off: [[0, 1440] as const] };
        expect(offSpans(off, [480, 1080])).toEqual([[480, 1080]]);
        expect(closedSpans(off, [480, 1080])).toEqual([]);
    });

    it("leaves free time alone: an open day has nothing closed", () => {
        expect(
            closedSpans({ windows: [[480, 1080]], off: [] }, [480, 1080]),
        ).toEqual([]);
    });
});

describe("a day's hours across the diary, for the week", () => {
    const col = (windows: [number, number][], off: [number, number][] = []) =>
        ({
            key: "k",
            name: "n",
            title: null,
            blocks: [],
            day: { windows, off, free: [] },
        }) as Column;

    it("is open while anybody works, and off only when nobody does", () => {
        expect(
            hoursAcross([col([[540, 780]]), col([[720, 1020]], [[540, 720]])]),
        ).toEqual({ windows: [[540, 1020]], off: [] });
        expect(hoursAcross([col([], [[0, 1440]])])).toEqual({
            windows: [],
            off: [[0, 1440]],
        });
    });

    it("is unknown when no column knows its hours", () => {
        expect(hoursAcross([{ ...col([]), day: null }])).toBeNull();
        expect(hoursAcross([])).toBeNull();
    });
});

describe("who still owes", () => {
    it("goes by what the API says there is to take", () => {
        expect(toPay(booking({ take: { cents: 50_000, byLink: true } }))).toBe(
            true,
        );
        expect(toPay(booking({ take: null }))).toBe(false);
        // A viewer who reads no money is told only that there is something.
        expect(toPay(booking({ take: null, toTake: true }))).toBe(true);
        expect(toPay(booking({ toTake: false }))).toBe(false);
    });

    it("falls back to how it pays, from an API that says neither", () => {
        expect(toPay(booking({ paidWith: "DESK" }))).toBe(true);
        expect(
            toPay(
                booking({ paidWith: "DESK", paidAtDesk: { method: "CASH" } }),
            ),
        ).toBe(false);
        expect(toPay(booking({ paidWith: "PAID" }))).toBe(false);
        expect(toPay(booking({ paidWith: "PACK" }))).toBe(false);
    });

    it("is never owed on a cancelled booking", () => {
        expect(
            toPay(
                booking({
                    status: "CANCELLED",
                    take: { cents: 1, byLink: false },
                }),
            ),
        ).toBe(false);
    });

    it("marks a booking Awaiting payment and a class by how many places owe", () => {
        expect(toPayText(one("a", 540, 600))).toBe("Awaiting payment");
        expect(toPayText(one("a", 540, 600, { paidWith: "PAID" }))).toBeNull();
        expect(
            toPayText(
                klass("c", [
                    booking({ id: "s1" }),
                    booking({ id: "s2" }),
                    booking({ id: "s3", paidWith: "PACK" }),
                    booking({ id: "s4", status: "CANCELLED" }),
                ]),
            ),
        ).toBe("2 awaiting payment");
        expect(
            toPayText(one("x", 540, 600, { status: "CANCELLED" })),
        ).toBeNull();
    });
});

describe("where a booking from a free gap starts", () => {
    it("is the nearest quarter hour to the tap", () => {
        expect(slotIn([540, 1020], 604)).toBe(600);
        expect(slotIn([540, 1020], 609)).toBe(615);
    });

    it("never starts before the gap opens", () => {
        expect(slotIn([550, 1020], 544)).toBe(550);
    });

    it("leaves room for the shortest thing bookable", () => {
        // An hour's gap and an hour's service: only the start fits.
        expect(slotIn([840, 900], 870, 60)).toBe(840);
        expect(slotIn([540, 1020], 1015, 45)).toBe(975);
    });
});

describe("what is brought into view first", () => {
    it("is now on today", () => {
        expect(firstSight(700, [one("a", 540, 600)], [], [480, 1080])).toBe(
            700,
        );
        // Now outside the hours shown stays inside them.
        expect(firstSight(1300, [], [], [480, 1080])).toBe(1080);
    });

    it("is the first booking that still happens, else the opening time", () => {
        expect(
            firstSight(
                null,
                [
                    one("x", 500, 560, { status: "CANCELLED" }),
                    one("a", 660, 720),
                ],
                [[540, 1020]],
                [480, 1080],
            ),
        ).toBe(660);
        expect(firstSight(null, [], [[540, 1020]], [480, 1080])).toBe(540);
        expect(firstSight(null, [], [], [480, 1080])).toBeNull();
    });
});

describe("the lanes of what is drawn", () => {
    it("gives a cancelled line a lane only beside what starts with it", () => {
        const lanes = drawnLanes([
            one("gone", 600, 720, { status: "CANCELLED" }),
            one("later", 660, 720),
            one("now", 600, 630),
        ]);
        // The live booking at the same start shares its time with the line.
        expect(lanes.get("now")?.lanes).toBe(2);
        expect(lanes.get("gone")?.lanes).toBe(2);
        // An hour on, the time the cancelled booking gave back is whole.
        expect(lanes.get("later")).toEqual({ lane: 0, lanes: 1 });
    });
});

describe("the legend", () => {
    it("is empty when only bookings are drawn", () => {
        expect(
            legendOf({
                blocks: [one("a", 540, 600), one("b", 600, 660)],
                closed: false,
                off: false,
            }),
        ).toEqual([]);
        expect(legendOf({ blocks: [], closed: false, off: false })).toEqual([]);
    });

    it("names only what is drawn", () => {
        expect(
            legendOf({
                blocks: [one("a", 540, 600)],
                closed: true,
                off: false,
            }),
        ).toEqual(["closed"]);
        expect(legendOf({ blocks: [], closed: true, off: true })).toEqual([
            "closed",
            "off",
        ]);
    });

    it("tells one-to-one from class only when both are on the view", () => {
        expect(
            legendOf({
                blocks: [one("a", 540, 600), klass("c", [])],
                closed: false,
                off: false,
            }),
        ).toEqual(["one", "class"]);
        expect(
            legendOf({ blocks: [klass("c", [])], closed: false, off: false }),
        ).toEqual([]);
    });

    it("names cancelled only while cancelled bookings are drawn", () => {
        expect(
            legendOf({
                blocks: [one("x", 540, 600, { status: "CANCELLED" })],
                closed: false,
                off: false,
            }),
        ).toEqual(["cancelled"]);
    });
});

describe("the week's days (U5)", () => {
    const col = (
        key: string,
        windows: [number, number][] | null,
        blocks: Block[] = [],
    ): Column => ({
        key,
        name: key === "meera" ? "Meera Iyer" : "Arjun Rao",
        title: null,
        day: windows ? { windows, off: [], free: [] } : null,
        blocks,
    });

    it("measures how full a day is against each person's own hours", () => {
        // Meera 9 to 1 with 2 hours booked; Arjun 10 to 6, nothing.
        const day = [
            col(
                "meera",
                [[540, 780]],
                [one("a", 540, 600), one("b", 660, 720)],
            ),
            col("arjun", [[600, 1080]]),
        ];
        expect(dayFullness(day)).toBeCloseTo(120 / 720);
        // A cancelled booking takes nothing; time outside the hours neither.
        expect(
            dayFullness([
                col(
                    "meera",
                    [[540, 600]],
                    [
                        one("x", 540, 600, { status: "CANCELLED" }),
                        one("late", 600, 660),
                    ],
                ),
            ]),
        ).toBe(0);
        expect(
            dayFullness([col("meera", [[540, 600]], [one("a", 500, 700)])]),
        ).toBe(1);
    });

    it("has nothing to measure without hours or with nobody open", () => {
        expect(dayFullness([col("meera", null, [one("a", 540, 600)])])).toBe(
            null,
        );
        expect(dayFullness([col("meera", [])])).toBe(null);
    });

    it("says closed every week only when nobody works that weekday", () => {
        const shut = [col("meera", []), col("arjun", [])];
        expect(closedKind(shut, () => false)).toBe("weekly");
        // Arjun works Sundays as a rule, but not this one.
        expect(closedKind(shut, (k) => k === "arjun")).toBe("day");
        expect(
            closedKind(
                [col("meera", []), col("arjun", [[600, 660]])],
                () => false,
            ),
        ).toBe(null);
        // Unknown hours are never read as closed.
        expect(closedKind([col("meera", null)], () => false)).toBe(null);
        expect(closedKind([], () => false)).toBe(null);
    });

    it("keeps a lane per person, in the order first seen", () => {
        expect(
            weekLanes([
                [col("meera", [])],
                [col("arjun", []), col("meera", [])],
            ]),
        ).toEqual([
            { key: "meera", name: "Meera Iyer" },
            { key: "arjun", name: "Arjun Rao" },
        ]);
    });
});

describe("Everyone's free time on a phone's day (BKVCalendarBPhone)", () => {
    const col = (key: string, free: [number, number][]): Column => ({
        key,
        name: key,
        title: null,
        day: { windows: [[540, 1080]], off: [], free },
        blocks: [],
    });

    it("is free wherever someone is, each stretch with whoever is free all through it", () => {
        const meera = col("meera", [
            [600, 780],
            [840, 960],
        ]);
        const arjun = col("arjun", [[720, 900]]);
        const out = everyoneFree([meera, arjun], () => true);
        expect(out.map((f) => [f.column.key, f.free])).toEqual([
            ["meera", [600, 780]],
            ["arjun", [780, 900]],
            ["meera", [900, 960]],
        ]);
    });

    it("offers only who may be booked, and nothing under 15 minutes", () => {
        const meera = col("meera", [[600, 610]]);
        const arjun = col("arjun", [[600, 700]]);
        expect(everyoneFree([meera, arjun], (c) => c.key !== "arjun")).toEqual(
            [],
        );
    });

    it("is split around any booking drawn on the column, Unassigned too", () => {
        // Meera free 9 to 1; someone's booking 10 to 11 sits on the column.
        const meera = { ...col("meera", [[540, 780]]), shortest: 30 };
        expect(
            everyoneFree([meera], () => true, [[600, 660]]).map((f) => f.free),
        ).toEqual([
            [540, 600],
            [660, 780],
        ]);
        // A piece shorter than her shortest booking isn't offered.
        expect(
            everyoneFree([meera], () => true, [[560, 760]]).map((f) => f.free),
        ).toEqual([]);
    });
});
