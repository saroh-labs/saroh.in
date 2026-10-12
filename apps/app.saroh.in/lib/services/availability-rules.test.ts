import { describe, expect, it } from "vitest";

import type { StaffView } from "@/lib/staff/types";

import {
    copyMondayToWeekdays,
    draftFrom,
    outsideHours,
    payWayBlocked,
    payWayHint,
    payWayOf,
    rangeRefusal,
    refundsInTime,
    ruleBefore,
    ruleChoices,
    rulePatch,
    ruleRows,
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
        expect(saveOps(staff, draftFrom(staff))).toEqual([]);
    });

    it("turns a draft into the writes, each with what Undo puts back", () => {
        const staff = [person()];
        const draft = draftFrom(staff);
        draft.hours.st_vikram = copyMondayToWeekdays(draft.hours.st_vikram);
        draft.offRemoved.push("t1");
        draft.extraRemoved.push("x1");
        draft.offAdded.push({
            key: "n1",
            staffId: "st_vikram",
            fromDate: "2026-10-02",
            toDate: "2026-10-02",
            startMinute: null,
            endMinute: null,
            reason: "Physio",
        });
        const ops = saveOps(staff, draft);
        // Never a rule: each saves in its own sheet.
        expect(ops.map((o) => o.kind)).toEqual([
            "hours",
            "removeOff",
            "removeExtra",
            "addOff",
        ]);
        const hours = ops.at(0);
        expect(hours?.kind === "hours" && hours.before).toEqual([
            MON,
            MON_PM,
            SAT,
        ]);
    });

    it("removes a part-day range and a closure as one write each (E3)", () => {
        const days = ["2026-11-02", "2026-11-03", "2026-11-04"];
        const staff = [
            person({
                timeOff: days.map((day, i) => ({
                    id: `p${i}`,
                    startAt: `${day}T08:30:00.000Z`,
                    endAt: `${day}T12:30:00.000Z`,
                    allDay: false,
                    reason: "Course",
                })),
            }),
        ];
        const closures = [
            {
                id: "c1",
                startAt: "2026-11-08T18:30:00.000Z",
                endAt: "2026-11-13T18:30:00.000Z",
                allDay: true,
                reason: "Diwali",
            },
        ];
        const draft = draftFrom(staff);
        draft.offRemoved.push("p0", "p1", "p2", "c1");
        draft.offAdded.push({
            key: "n2",
            staffId: null,
            fromDate: "2026-12-25",
            toDate: "2026-12-25",
            startMinute: null,
            endMinute: null,
            reason: "Closed",
        });
        const ops = saveOps(staff, draft, closures, "Asia/Kolkata");
        expect(ops.map((o) => o.kind)).toEqual([
            "removeClosure",
            "removeOff",
            "addOff",
        ]);
        const off = ops.find((o) => o.kind === "removeOff");
        expect(off?.kind === "removeOff" && off.before.ids).toEqual([
            "p0",
            "p1",
            "p2",
        ]);
        const add = ops.find((o) => o.kind === "addOff");
        expect(add?.kind === "addOff" && add.off.staffId).toBeNull();
    });
});

describe("the refund policy (E30, DEC-058)", () => {
    it("reads as on when an older API leaves it out, or never set", () => {
        expect(refundsInTime(RULES)).toBe(true);
        expect(refundsInTime({ ...RULES, refundInTimeCancels: false })).toBe(
            false,
        );
    });

    it("turning it off is that one field, with the old policy for Undo", () => {
        const before = { ...RULES, refundInTimeCancels: true };
        expect(rulePatch("refundInTimeCancels", "keep")).toEqual({
            refundInTimeCancels: false,
        });
        expect(ruleBefore("refundInTimeCancels", before)).toEqual({
            refundInTimeCancels: true,
        });
        // Left out by an older API: put back as on, which is what it was.
        expect(ruleBefore("refundInTimeCancels", RULES)).toEqual({
            refundInTimeCancels: true,
        });
    });
});

describe("the page's draft no longer holds the rules", () => {
    it("has hours, time off and extra hours, and no rules", () => {
        const draft = draftFrom([person()]);
        expect(Object.keys(draft).sort()).toEqual([
            "extraRemoved",
            "hours",
            "offAdded",
            "offRemoved",
        ]);
        expect(saveOps([person()], draft)).toEqual([]);
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

describe("how people pay when they book (DEC-088)", () => {
    it("reads as Both when an older API leaves it out", () => {
        expect(payWayOf(RULES)).toBe("BOTH");
        expect(payWayOf({ ...RULES, bookingPayment: "DESK" })).toBe("DESK");
    });

    it("changing it is that one field, with the old way for Undo", () => {
        expect(rulePatch("bookingPayment", "ONLINE")).toEqual({
            bookingPayment: "ONLINE",
        });
        // Left out by an older API: Both goes back, which is what it was.
        expect(ruleBefore("bookingPayment", RULES)).toEqual({
            bookingPayment: "BOTH",
        });
    });

    it("says what each way means, and why online can't be taken when it matters", () => {
        expect(payWayHint("BOTH", null)).toBe(
            "People pay online when they book, or at the desk. A deposit is paid online, or at the desk when you can't take payment online.",
        );
        expect(payWayHint("DESK", "NO_PROVIDER")).toBe(
            "Nobody pays on the booking page. They pay when they come, a deposit too.",
        );
        expect(payWayHint("ONLINE", "NO_PROVIDER")).toBe(
            "Everyone pays on the booking page when they book. Free services book with nothing to pay. Right now no payment provider is connected, so nobody can book a service with a price online.",
        );
        expect(payWayHint("BOTH", "PAYMENTS_OFF")).toBe(
            "People pay online when they book, or at the desk. A deposit is paid online, or at the desk when you can't take payment online. Right now Payments is switched off, so everything is paid at the desk.",
        );
        // Couldn't tell: says nothing more.
        expect(payWayHint("ONLINE", undefined)).toBe(
            "Everyone pays on the booking page when they book. Free services book with nothing to pay.",
        );
    });
});

describe("ruleRows: each rule as a sentence in a row", () => {
    const said = (rules: Parameters<typeof ruleRows>[0]) =>
        ruleRows(rules).map((r) => r.sentence);

    it("says every rule whole, with no label needed to read it", () => {
        expect(
            said({
                bookAheadDays: 60,
                latestBookingMinutes: 120,
                freeCancelHours: 12,
                refundInTimeCancels: true,
                bookingPayment: "BOTH",
            }),
        ).toEqual([
            "Book up to 60 days ahead",
            "Book up to 2 hours before the start",
            "Free to cancel up to 12 hours before",
            "Pay online or at the desk",
            "Cancelled in time: refund what they paid online",
        ]);
    });

    it("says no rule in words too, never a bare 'Any time before'", () => {
        expect(
            said({
                bookAheadDays: null,
                latestBookingMinutes: null,
                freeCancelHours: null,
                refundInTimeCancels: false,
                bookingPayment: "DESK",
            }),
        ).toEqual([
            "No limit on how far ahead",
            "Book up to the start time",
            "Free to cancel any time before",
            "Pay at the desk",
            "Cancelled in time: don't refund automatically",
        ]);
        expect(said({ ...RULES, bookAheadDays: 56 })[0]).toBe(
            "Book up to 8 weeks ahead",
        );
    });

    it("offers the same choices as before, with the help they had", () => {
        const rows = ruleRows(
            { ...RULES, bookAheadDays: 21, bookingPayment: "ONLINE" },
            "NO_PROVIDER",
        );
        expect(rows.map((r) => r.key)).toEqual([
            "bookAheadDays",
            "latestBookingMinutes",
            "freeCancelHours",
            "bookingPayment",
            "refundInTimeCancels",
        ]);
        // The saved value is one of the choices, off the list or not.
        for (const row of rows) {
            expect(row.options.map((o) => o.value)).toContain(row.value);
        }
        const pay = rows.at(3);
        expect(pay?.options.map((o) => o.label)).toEqual([
            "Both",
            "Online",
            "At the desk",
        ]);
        expect(pay?.options[1]?.note).toBe(payWayHint("ONLINE", "NO_PROVIDER"));
        expect(rows[4]?.hint).toMatch(/A late cancel is never refunded/);
    });

    it("turns a choice into the one field it changes, null for no limit", () => {
        expect(rulePatch("bookAheadDays", "28")).toEqual({ bookAheadDays: 28 });
        expect(rulePatch("freeCancelHours", "")).toEqual({
            freeCancelHours: null,
        });
        expect(ruleBefore("latestBookingMinutes", RULES)).toEqual({
            latestBookingMinutes: RULES.latestBookingMinutes,
        });
    });

    it("says why online can't be taken apart from what the way means", () => {
        expect(payWayBlocked("BOTH", "PAYMENTS_OFF")).toBe(
            "Right now Payments is switched off, so everything is paid at the desk.",
        );
        expect(payWayBlocked("DESK", "NO_PROVIDER")).toBeNull();
        expect(payWayBlocked("ONLINE", null)).toBeNull();
    });
});
