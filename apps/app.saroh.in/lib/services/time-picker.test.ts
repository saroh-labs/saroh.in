import { describe, expect, it } from "vitest";

import {
    dayName,
    nextFreeDay,
    partsOfDay,
    pickerDays,
    slotPerson,
    slotsByDay,
    takenMessage,
    zoneShortName,
} from "@/lib/services/time-picker";

/** The time picker's days and times, in the business's zone (U3, Q10). */
const ZONE = "Asia/Kolkata";
const at = (local: string) => new Date(`${local}:00+05:30`).toISOString();
const slot = (local: string, staffIds?: string[]) => ({
    startAt: at(local),
    endAt: at(local),
    ...(staffIds ? { staffIds } : {}),
});

const SLOTS = [
    slot("2026-10-20T09:00"),
    slot("2026-10-20T10:00"),
    slot("2026-10-20T16:00"),
    slot("2026-10-26T09:00"),
];

describe("the time picker", () => {
    it("counts each day's free times, and says Closed on a shut day", () => {
        const days = pickerDays({
            from: "2026-10-19",
            today: "2026-10-19",
            count: 8,
            byDay: slotsByDay(SLOTS, ZONE),
            closedWeekdays: [0],
            timeZone: ZONE,
        });
        expect(days.map((d) => [d.weekday, d.day, d.count])).toEqual([
            ["Today", "19", "Full"],
            ["Tmrw", "20", "3 free"],
            ["Wed", "21", "Full"],
            ["Thu", "22", "Full"],
            ["Fri", "23", "Full"],
            ["Sat", "24", "Full"],
            ["Sun", "25", "Closed"],
            ["Mon", "26", "1 free"],
        ]);
        expect(days[1]?.aria).toBe("Tue 20 Oct, 3 free times");
        expect(days[6]?.aria).toBe("Sun 25 Oct, closed");
    });

    it("jumps from a closed Sunday to the next free day", () => {
        const days = pickerDays({
            from: "2026-10-19",
            today: "2026-10-19",
            byDay: slotsByDay(SLOTS, ZONE),
            closedWeekdays: [0],
            timeZone: ZONE,
        });
        expect(nextFreeDay(days, "2026-10-25")?.date).toBe("2026-10-26");
        expect(nextFreeDay(days, "2026-10-26")).toBeNull();
    });

    it("splits a day into Morning and Afternoon and evening", () => {
        const day = slotsByDay(SLOTS, ZONE).get("2026-10-20") ?? [];
        const { morning, later } = partsOfDay(day, ZONE);
        expect(morning).toHaveLength(2);
        expect(later).toHaveLength(1);
    });

    it("names the day as the boards head it", () => {
        expect(dayName("2026-10-19", "2026-10-19", ZONE)).toBe("Today 19 Oct");
        expect(dayName("2026-10-20", "2026-10-19", ZONE)).toBe("Tue 20 Oct");
    });

    it("says a time was just taken in the business's clock", () => {
        expect(takenMessage(at("2026-10-20T10:00"), ZONE)).toBe(
            "10:00 am was just booked by someone else. Pick another time.",
        );
    });

    it("names who is free at a start, for Anyone free", () => {
        const people = [
            { id: "p_meera", name: "Meera Iyer" },
            { id: "p_arjun", name: "Arjun Rao" },
        ];
        expect(
            slotPerson(slot("2026-10-20T09:00", ["p_arjun"]), people)?.name,
        ).toBe("Arjun Rao");
        expect(slotPerson(slot("2026-10-20T09:00"), people)).toBeNull();
    });

    it("labels the business's zone as people know it (Q10)", () => {
        const at = Date.parse("2026-10-19T03:00:00.000Z");
        expect(zoneShortName("Asia/Kolkata", at)).toBe("IST");
        expect(zoneShortName("Europe/London", at)).toBe("BST");
    });
});
