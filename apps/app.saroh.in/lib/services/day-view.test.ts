import { describe, expect, it } from "vitest";

import type { ClassSession, DiaryBooking } from "./booking-calendar";
import {
    columnCount,
    columnHours,
    dayLine,
    dayPill,
    dayWhat,
    everyoneBlocks,
    firstDayName,
    isFirstDay,
} from "./day-view";
import type { Block, Column } from "./diary";

/** What the Day calendar says on what it draws (U4, #1020). */

const booking = (extra: Partial<DiaryBooking> = {}): DiaryBooking =>
    ({
        id: "b",
        serviceId: "svc",
        status: "CONFIRMED",
        outcome: null,
        bookerName: "Ananya Desai",
        bookerEmail: null,
        contact: null,
        paidWith: "PAID",
        service: { id: "svc", name: "Physio assessment", capacity: 1 },
        ...extra,
    }) as DiaryBooking;

const one = (
    extra: Partial<DiaryBooking> = {},
    state: Block["state"] = "booked",
    span: [number, number] = [540, 585],
): Block => ({
    kind: "one",
    key: extra.id ?? "b",
    start: span[0],
    end: span[1],
    state,
    staffId: "meera",
    booking: booking(extra),
});

const klass = (taken: number, capacity: number, owe = 0): Block => ({
    kind: "class",
    key: "c",
    start: 420,
    end: 480,
    state: taken >= capacity ? "full" : "open",
    staffId: "neha",
    session: {
        key: "c",
        capacity,
        taken,
        service: { id: "pilates", name: "Mat Pilates" },
        bookings: Array.from({ length: taken }, (_, i) =>
            booking({
                id: `s${i}`,
                paidWith: i < owe ? "DESK" : "PAID",
            }),
        ),
    } as unknown as ClassSession,
});

describe("the pill a booking wears", () => {
    it("says how it went first", () => {
        expect(dayPill(one({ outcome: "ATTENDED" }, "in"))).toBe("Came");
        expect(dayPill(one({ outcome: "NO_SHOW" }, "noshow"))).toBe(
            "Didn't come",
        );
    });

    it("says someone who came still owes", () => {
        expect(
            dayPill(one({ outcome: "ATTENDED", paidWith: "DESK" }, "in")),
        ).toBe("To pay");
    });

    it("says Awaiting payment while held for the customer to pay", () => {
        expect(dayPill(one({ status: "PENDING" }, "pending"))).toBe(
            "Awaiting payment",
        );
    });

    it("says Pays at the visit, Paid, or nothing", () => {
        expect(dayPill(one({ paidWith: "DESK" }))).toBe("Pays at the visit");
        expect(dayPill(one({ paidWith: "PAID" }))).toBe("Paid");
        expect(dayPill(one({ paidWith: "PACK" }))).toBeNull();
        expect(dayPill(one({ status: "CANCELLED" }, "cancelled"))).toBeNull();
    });

    it("says how many places owe on a class", () => {
        expect(dayPill(klass(8, 8, 2))).toBe("2 to pay");
        expect(dayPill(klass(6, 8))).toBeNull();
    });
});

describe("a booking's line", () => {
    it("is when and what", () => {
        expect(dayLine(one())).toBe("9:00 to 9:45 am · Physio assessment");
    });

    it("says a pack or membership, never how it is paid otherwise", () => {
        expect(dayWhat(one({ paidWith: "PACK" }))).toBe(
            "Physio assessment · class pack",
        );
        expect(dayWhat(one({ paidWith: "DESK" }))).toBe("Physio assessment");
    });

    it("says a class's places, and full", () => {
        expect(dayWhat(klass(6, 8))).toBe("6 of 8 places");
        expect(dayWhat(klass(8, 8))).toBe("8 of 8 · full");
    });
});

describe("a column's head", () => {
    it("counts what is booked, classes as classes", () => {
        expect(columnCount([])).toBe("Nothing booked");
        expect(columnCount([one(), one({ id: "x" })])).toBe("2 booked");
        expect(columnCount([klass(6, 8), klass(8, 8)])).toBe("2 classes");
        expect(columnCount([one({}, "cancelled")])).toBe("Nothing booked");
    });

    it("gives the day's hours from open to close", () => {
        expect(
            columnHours({
                windows: [
                    [540, 780],
                    [900, 1140],
                ],
                off: [],
                free: [],
            }),
        ).toBe("9 am to 7 pm");
        expect(columnHours({ windows: [], off: [], free: [] })).toBe(
            "Not working today",
        );
        expect(columnHours(null)).toBeNull();
    });
});

const column = (
    key: string,
    name: string,
    blocks: Block[],
    free = true,
): Column => ({
    key,
    name,
    title: null,
    blocks,
    day: { windows: [[540, 1020]], off: [], free: free ? [[540, 1020]] : [] },
});

describe("Everyone's day on a phone", () => {
    it("is every block in time order, saying whose", () => {
        const list = everyoneBlocks([
            column("meera", "Meera Iyer", [
                one({ id: "late" }, "booked", [600, 630]),
            ]),
            column("arjun", "Dr. Arjun Rao", [one({ id: "early" })]),
        ]);
        expect(list.map((e) => [e.block.key, e.who])).toEqual([
            ["early", "Dr. Rao"],
            ["late", "Meera"],
        ]);
    });
});

describe("the first day", () => {
    const empty = { diaries: [{ person: null, bookings: [], classes: [] }] };

    it("is nothing ever booked and time free to book", () => {
        expect(isFirstDay(empty, [column("m", "Meera Iyer", [])])).toBe(true);
        expect(isFirstDay(empty, [column("m", "Meera Iyer", [], false)])).toBe(
            false,
        );
        expect(
            isFirstDay(
                {
                    diaries: [
                        { person: null, bookings: [booking()], classes: [] },
                    ],
                },
                [column("m", "Meera Iyer", [])],
            ),
        ).toBe(false);
    });

    it("names the one person shown, else nobody", () => {
        expect(firstDayName([column("m", "Meera Iyer", [])])).toBe("Meera");
        expect(
            firstDayName([
                column("m", "Meera Iyer", []),
                column("a", "Arjun Rao", []),
            ]),
        ).toBeNull();
    });
});
