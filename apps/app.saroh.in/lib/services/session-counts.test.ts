import { describe, expect, it } from "vitest";

import type { DiaryBooking } from "./booking-calendar";
import { counted, countedWords, countItems, listItems } from "./session-counts";

const booking = (
    id: string,
    over: Partial<DiaryBooking> = {},
    capacity = 1,
): DiaryBooking =>
    ({
        id,
        serviceId: capacity > 1 ? "yoga" : "physio",
        startAt: "2026-11-25T04:30:00.000Z",
        endAt: "2026-11-25T05:30:00.000Z",
        status: "CONFIRMED",
        service: { id: "s", name: "Yoga flow", capacity },
        ...over,
    }) as DiaryBooking;

describe("sessions and people (DEC-260)", () => {
    it("counts a class once as a session and by its people", () => {
        expect(counted([1, 7, 1])).toEqual({ sessions: 3, people: 9 });
        expect(countedWords({ sessions: 3, people: 9 })).toBe(
            "3 sessions · 9 people",
        );
        expect(countedWords({ sessions: 1, people: 1 })).toBe(
            "1 session · 1 person",
        );
        expect(countedWords({ sessions: 0, people: 0 })).toBe("Nothing booked");
    });

    it("groups a class start into one List row and counts it the same", () => {
        const rows = [
            booking("a", {}, 15),
            booking("one"),
            booking("b", {}, 15),
            booking("c", { status: "CANCELLED" }, 15),
            booking("later", { startAt: "2026-11-25T10:30:00.000Z" }, 15),
        ];
        const items = listItems(rows);
        expect(items.map((i) => i.kind)).toEqual(["class", "one", "class"]);
        expect(
            items[0]?.kind === "class" && items[0].bookings.map((b) => b.id),
        ).toEqual(["a", "b", "c"]);
        expect(countItems(items)).toEqual({ sessions: 3, people: 4 });
    });
});
