import { describe, expect, it } from "vitest";

import type { ClassSession, DiaryBooking } from "./booking-calendar";
import type { Block } from "./diary";
import {
    freeTally,
    listLine,
    nextLine,
    nextUp,
    placesLeft,
    startsIn,
} from "./diary-list";

const one = (
    key: string,
    start: number,
    state: Block["state"] = "booked",
    over: Partial<DiaryBooking> = {},
): Block => ({
    kind: "one",
    key,
    start,
    end: start + 45,
    state,
    staffId: "meera",
    booking: {
        service: { name: "Physio assessment" },
        staff: { id: "meera", name: "Meera Iyer" },
        paidWith: "DESK",
        paidAtDesk: null,
        bookerName: "Kabir Singh",
        contact: null,
        ...over,
    } as unknown as DiaryBooking,
});

const cls = (taken: number, state: Block["state"] = "open"): Block => ({
    kind: "class",
    key: "c",
    start: 420,
    end: 480,
    state,
    staffId: "neha",
    session: {
        service: { name: "Mat Pilates" },
        staff: { id: "neha", name: "Neha Kapoor" },
        capacity: 8,
        taken,
        bookings: Array.from({ length: taken }, () => ({
            status: "CONFIRMED",
        })),
    } as unknown as ClassSession,
});

describe("the next thing on today's list", () => {
    it("is the first one not yet started and not marked", () => {
        const blocks = [
            one("a", 540, "in"),
            one("b", 690),
            one("c", 600, "noshow"),
            one("d", 700),
        ];
        expect(nextUp(blocks, 680)?.key).toBe("b");
    });

    it("skips cancelled ones, and is null when nothing is left", () => {
        expect(nextUp([one("a", 700, "cancelled")], 680)).toBeNull();
        expect(nextUp([one("a", 600)], 680)).toBeNull();
    });

    it("says how soon in plain words", () => {
        expect(startsIn(0)).toBe("now");
        expect(startsIn(10)).toBe("in 10 min");
        expect(startsIn(60)).toBe("in 1 hr");
        expect(startsIn(135)).toBe("in 2 hr 15 min");
    });

    it("says what, with whom and how soon", () => {
        expect(nextLine(one("a", 690), 10)).toBe(
            "Physio assessment with Meera · in 10 min",
        );
        expect(nextLine(cls(6), 25)).toBe(
            "With Neha · 6 of 8 places · in 25 min",
        );
    });
});

describe("a booked row's line", () => {
    it("names the service, who takes it and how it is paid", () => {
        expect(listLine(one("a", 540))).toBe(
            "Physio assessment · Meera · pays at the visit",
        );
        expect(listLine(one("a", 540, "booked", { paidWith: "PAID" }))).toBe(
            "Physio assessment · Meera · paid",
        );
        expect(listLine(one("a", 540, "booked", { paidWith: "PACK" }))).toBe(
            "Physio assessment · Meera · class pack",
        );
        expect(listLine(one("a", 540, "in"))).toBe("Physio assessment · Meera");
    });

    it("names a class's teacher and its places", () => {
        expect(listLine(cls(6))).toBe("Neha Kapoor · 6 of 8 places");
    });

    it("says how many places a class has left, and nothing when full", () => {
        expect(placesLeft(cls(6))).toEqual({
            long: "2 places left",
            short: "2 left",
        });
        expect(placesLeft(cls(7))?.long).toBe("1 place left");
        expect(placesLeft(cls(8, "full"))).toBeNull();
        expect(placesLeft(one("a", 540))).toBeNull();
    });
});

describe("the free times' tally", () => {
    it("counts each person's, by the name the business calls them", () => {
        expect(
            freeTally([
                { who: "Meera Iyer" },
                { who: "Meera Iyer" },
                { who: "Dr. Arjun Rao" },
            ]),
        ).toBe("Meera 2 · Dr. Rao 1");
    });
});
