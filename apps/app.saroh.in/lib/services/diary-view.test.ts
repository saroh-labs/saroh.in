import { describe, expect, it } from "vitest";

import type { ClassSession, DiaryBooking } from "./booking-calendar";
import type { Block, Column } from "./diary";
import {
    closedSpans,
    drawnLanes,
    firstSight,
    hoursAcross,
    legendOf,
    offSpans,
    slotIn,
    toPay,
    toPayText,
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

    it("marks a booking To pay and a class by how many places owe", () => {
        expect(toPayText(one("a", 540, 600))).toBe("To pay");
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
        ).toBe("2 to pay");
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
