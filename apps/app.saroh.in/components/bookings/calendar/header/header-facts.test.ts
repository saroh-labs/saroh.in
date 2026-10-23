import { describe, expect, it } from "vitest";

import type {
    BookingsCalendar,
    DiaryBooking,
} from "@/lib/services/booking-calendar";
import { EVERYONE } from "@/lib/services/bookings-opens";
import type { StaffView } from "@/lib/staff/types";

import { dayFactsOf, personChoices } from "./header-facts";

/** What the date sheet and Whose bookings say, from the calendar's read. */
const IST = "Asia/Kolkata";
const at = (day: string, hour: number, staff: string, status = "CONFIRMED") =>
    ({
        id: `${staff}-${day}-${hour}`,
        startAt: new Date(
            Date.parse(`${day}T00:00:00+05:30`) + hour * 3_600_000,
        ).toISOString(),
        endAt: new Date(
            Date.parse(`${day}T00:00:00+05:30`) + (hour + 1) * 3_600_000,
        ).toISOString(),
        status,
        outcome: null,
        service: {
            id: "svc",
            name: "Physio",
            capacity: 1,
            durationMinutes: 60,
        },
        staff: { id: staff, name: staff },
    }) as unknown as DiaryBooking;
const person = (id: string, weekdays: number[]) =>
    ({
        id,
        name: id === "meera" ? "Meera Iyer" : "Arjun Rao",
        title: "Physiotherapist",
        status: "ACTIVE",
        serviceIds: ["svc"],
        hours: weekdays.map((d) => ({
            dayOfWeek: d,
            startMinute: 540,
            endMinute: 1080,
        })),
        extraHours: [],
        timeOff: [],
    }) as unknown as StaffView;
const staff = [person("meera", [1, 2, 3, 4, 5]), person("arjun", [2, 6])];
const calendar: BookingsCalendar = {
    from: "",
    to: "",
    timezone: IST,
    money: true,
    diaries: [
        {
            person: { id: "meera", name: "Meera Iyer", title: null },
            bookings: [
                at("2026-10-20", 10, "meera"),
                at("2026-10-20", 12, "meera", "CANCELLED"),
            ],
            classes: [],
        },
        {
            person: { id: "arjun", name: "Arjun Rao", title: null },
            bookings: [at("2026-10-20", 11, "arjun")],
            classes: [],
        },
    ],
};
const factsFor = (who: string) =>
    dayFactsOf({
        calendar,
        staff,
        timezone: IST,
        gapAfter: () => 0,
        minFree: () => 30,
        serviceHours: null,
        person: who,
        first: "2026-10-19",
        last: "2026-10-31",
    });

describe("each day's facts", () => {
    it("count live bookings for whoever is shown", () => {
        expect(factsFor(EVERYONE)("2026-10-20").count).toBe(2);
        expect(factsFor("arjun")("2026-10-20").count).toBe(1);
    });

    it("say Closed when nobody shown works that day", () => {
        expect(factsFor(EVERYONE)("2026-10-25").closed).toBe(true); // a Sunday
        expect(factsFor(EVERYONE)("2026-10-24").closed).toBe(false); // Arjun's Saturday
        expect(factsFor("meera")("2026-10-24").closed).toBe(true);
    });

    it("know no count outside what was read", () => {
        expect(factsFor(EVERYONE)("2026-11-03").count).toBeNull();
    });
});

describe("whose bookings", () => {
    it("lists Everyone, then everyone active, with their counts", () => {
        const choices = personChoices(staff, [], (key) =>
            key === EVERYONE ? 3 : key === "meera" ? 2 : 1,
        );
        expect(choices.map((c) => [c.key, c.initials, c.count])).toEqual([
            [EVERYONE, "All", 3],
            ["meera", "MI", 2],
            ["arjun", "AR", 1],
        ]);
    });
});
