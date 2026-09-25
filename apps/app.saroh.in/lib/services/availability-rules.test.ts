import { describe, expect, it } from "vitest";

import type { StaffView } from "@/lib/staff/types";

import {
    copyMondayToWeekdays,
    draftFrom,
    outsideHours,
    rangeRefusal,
    ruleChoices,
    saveOps,
    weeklyHours,
} from "./availability-rules";

const MON = { dayOfWeek: 1, startMinute: 360, endMinute: 600 };
const MON_PM = { dayOfWeek: 1, startMinute: 1020, endMinute: 1260 };
const SAT = { dayOfWeek: 6, startMinute: 480, endMinute: 720 };

function person(over: Partial<StaffView> = {}): StaffView {
    return {
        id: "st_vikram",
        name: "Vikram",
        title: "Trainer",
        status: "ACTIVE",
        membership: null,
        serviceIds: [],
        hours: [MON, MON_PM, SAT],
        weeklyMinutes: 0,
        extraHours: [
            { id: "x1", date: "2026-09-27", startMinute: 480, endMinute: 660 },
        ],
        timeOff: [
            {
                id: "t1",
                startAt: "2026-09-27T18:30:00.000Z",
                endAt: "2026-09-28T18:30:00.000Z",
                allDay: true,
                reason: "Wedding",
            },
        ],
        ...over,
    };
}

const RULES = {
    bookAheadDays: 28,
    latestBookingMinutes: 120,
    freeCancelHours: 12,
};

describe("rangeRefusal", () => {
    it("refuses an end before the start, and overlapping hours", () => {
        expect(rangeRefusal([MON], { startMinute: 600, endMinute: 540 })).toBe(
            "The end has to be after the start.",
        );
        expect(rangeRefusal([MON], { startMinute: 540, endMinute: 660 })).toBe(
            "That overlaps hours already set.",
        );
        // Touching is not overlapping.
        expect(
            rangeRefusal([MON], { startMinute: 600, endMinute: 660 }),
        ).toBeNull();
    });
});

describe("copyMondayToWeekdays", () => {
    it("gives Tuesday to Friday Monday's hours and leaves the weekend", () => {
        const copied = copyMondayToWeekdays([
            MON,
            MON_PM,
            SAT,
            { dayOfWeek: 3, startMinute: 900, endMinute: 960 },
        ]);
        for (const day of [2, 3, 4, 5]) {
            expect(
                copied
                    .filter((h) => h.dayOfWeek === day)
                    .map((h) => [h.startMinute, h.endMinute]),
            ).toEqual([
                [360, 600],
                [1020, 1260],
            ]);
        }
        expect(copied.filter((h) => h.dayOfWeek === 6)).toEqual([SAT]);
        // 4h + 4h over five weekdays, plus Saturday's 4h.
        expect(weeklyHours(copied)).toBe(44);
    });
});

describe("outsideHours", () => {
    it("lists kept bookings the new hours no longer cover", () => {
        const kept = [
            {
                id: "b1",
                staffId: "st_vikram",
                weekday: 1,
                start: 420,
                who: "Tariq",
            },
            {
                id: "b2",
                staffId: "st_vikram",
                weekday: 1,
                start: 1080,
                who: "Priya",
            },
            {
                id: "b3",
                staffId: "st_other",
                weekday: 1,
                start: 1080,
                who: "Kiran",
            },
        ];
        expect(
            outsideHours(kept, "st_vikram", [MON], 1).map((b) => b.who),
        ).toEqual(["Priya"]);
    });
});

describe("saveOps", () => {
    it("is nothing for an untouched draft", () => {
        const staff = [person()];
        expect(saveOps(staff, RULES, draftFrom(staff, RULES))).toEqual([]);
    });

    it("turns a draft into the writes, each with what Undo puts back", () => {
        const staff = [person()];
        const draft = draftFrom(staff, RULES);
        draft.hours.st_vikram = copyMondayToWeekdays(draft.hours.st_vikram);
        draft.offRemoved.push("t1");
        draft.extraRemoved.push("x1");
        draft.offAdded.push({
            key: "n1",
            staffId: "st_vikram",
            date: "2026-10-02",
            reason: "Physio",
        });
        draft.rules.freeCancelHours = 24;
        const ops = saveOps(staff, RULES, draft);
        expect(ops.map((o) => o.kind)).toEqual([
            "hours",
            "removeOff",
            "removeExtra",
            "addOff",
            "rules",
        ]);
        const hours = ops.at(0);
        expect(hours?.kind === "hours" && hours.before).toEqual([
            MON,
            MON_PM,
            SAT,
        ]);
    });
});

describe("ruleChoices", () => {
    it("offers the design's choices, no limit, and a current value off the list", () => {
        const [ahead, latest] = ruleChoices({
            bookAheadDays: 21,
            latestBookingMinutes: 120,
            freeCancelHours: null,
        });
        expect(ahead.options.map((o) => o.label)).toEqual([
            "1 week",
            "2 weeks",
            "4 weeks",
            "8 weeks",
            "No limit",
            "3 weeks",
        ]);
        expect(latest.options.find((o) => o.value === "120")?.label).toBe(
            "2 hours before",
        );
    });
});
