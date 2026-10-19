// Each person's own booking rules (DEC-170, #1038): the fallback to the
// business's, field by field; which starts a customer may book per person;
// the request's moves; and who changes what at once.
import { personSlots } from "./availability";
import type { BookingRulesValue } from "./booking-rules";
import { NO_BOOKING_RULES } from "./booking-rules";
import type { DiaryRules, PersonRules } from "./person-rules";
import {
    applyRuleChanges,
    bookableStarts,
    changedRules,
    changesWords,
    furthestAhead,
    hasChanges,
    nextRequestStatus,
    ruleChangeRoute,
    ruleFor,
    rulesForPerson,
    SAME_AS_BUSINESS,
    storedRuleChanges,
    windowFor,
} from "./person-rules";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-19T06:00:00.000Z");

const business: BookingRulesValue = {
    ...NO_BOOKING_RULES,
    bookAheadDays: 28,
    latestBookingMinutes: 120,
    freeCancelHours: 24,
    gapMinutes: 0,
};

function own(over: Partial<PersonRules>): PersonRules {
    return { ...SAME_AS_BUSINESS, ...over };
}

const diary: DiaryRules = {
    business,
    people: new Map([
        // Arjun needs 12 hours' notice; everything else as the business.
        ["arjun", own({ latestBookingMinutes: 720 })],
        // Meera takes bookings up to the start, and only a week ahead.
        ["meera", own({ latestBookingMinutes: 0, bookAheadDays: 7 })],
    ]),
};

describe("a person's rules fall back to the business's, field by field", () => {
    it("is the business's with none of their own", () => {
        expect(rulesForPerson(business, null)).toEqual(business);
        expect(rulesForPerson(business, SAME_AS_BUSINESS)).toEqual(business);
    });

    it("takes each of theirs and leaves the rest", () => {
        const rules = rulesForPerson(
            business,
            own({ latestBookingMinutes: 720, gapMinutes: 15 }),
        );
        expect(rules).toMatchObject({
            latestBookingMinutes: 720,
            gapMinutes: 15,
            bookAheadDays: 28,
            freeCancelHours: 24,
        });
    });

    it("keeps a 0 as theirs: no notice, no gap, cancel any time", () => {
        const rules = rulesForPerson(
            business,
            own({ latestBookingMinutes: 0, freeCancelHours: 0, gapMinutes: 0 }),
        );
        expect(rules).toMatchObject({
            latestBookingMinutes: 0,
            freeCancelHours: 0,
            gapMinutes: 0,
        });
    });

    it("never changes how people pay or the refund policy", () => {
        const rules = rulesForPerson(
            { ...business, refundInTimeCancels: false, bookingPayment: "DESK" },
            own({ bookAheadDays: 3 }),
        );
        expect(rules.refundInTimeCancels).toBe(false);
        expect(rules.bookingPayment).toBe("DESK");
    });

    it("reads nobody as the business", () => {
        expect(ruleFor(diary, null)).toEqual(business);
        expect(ruleFor(diary, "someone-else")).toEqual(business);
    });
});

describe("which starts a customer may book, per person", () => {
    const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
    const slot = (hours: number, staffIds?: string[]) => ({
        startAt: at(hours),
        endAt: at(hours + 1),
        ...(staffIds ? { staffIds } : {}),
    });

    it("keeps only the people whose own window takes a start", () => {
        // In 3 hours: inside the business's 2, not Arjun's 12.
        expect(
            bookableStarts([slot(3, ["arjun", "meera"])], NOW, diary, true),
        ).toEqual([slot(3, ["meera"])]);
    });

    it("drops a start nobody's window takes", () => {
        expect(bookableStarts([slot(3, ["arjun"])], NOW, diary, true)).toEqual(
            [],
        );
        // In an hour: inside Meera's, not the business's (and not Arjun's).
        expect(
            bookableStarts([slot(1, ["arjun", "meera"])], NOW, diary, true),
        ).toEqual([slot(1, ["meera"])]);
    });

    it("keeps a class, or a start with nobody, to the business's", () => {
        expect(
            bookableStarts(
                [slot(1, ["meera"]), slot(3, ["arjun"])],
                NOW,
                diary,
                false,
            ),
        ).toEqual([slot(3, ["arjun"])]);
        expect(bookableStarts([slot(1), slot(3)], NOW, diary, true)).toEqual([
            slot(3),
        ]);
    });

    it("says why nobody can be booked, in the named person's words", () => {
        const named = windowFor(at(3), NOW, diary, ["arjun"]);
        expect(named.kept).toEqual([]);
        expect(named.refusal?.message).toBe(
            "Bookings close 12 hours before the start. Pick a later time.",
        );
        const either = windowFor(at(3), NOW, diary, ["arjun", "meera"]);
        expect(either).toEqual({ kept: ["meera"], refusal: null });
        // Past Meera's week, inside the business's four.
        const far = windowFor(new Date(NOW.getTime() + 10 * DAY), NOW, diary, [
            "meera",
        ]);
        expect(far.refusal?.message).toBe(
            "Bookings open 7 days ahead. Pick an earlier date.",
        );
    });

    it("opens days as far ahead as the furthest of them", () => {
        expect(furthestAhead(diary, ["meera"])).toBe(7);
        expect(furthestAhead(diary, ["meera", "arjun"])).toBe(28);
        expect(furthestAhead(diary, [])).toBe(28);
        expect(
            furthestAhead(
                {
                    business: { ...business, bookAheadDays: null },
                    people: diary.people,
                },
                ["meera", "arjun"],
            ),
        ).toBeNull();
    });
});

describe("the gap between bookings", () => {
    const service = {
        durationMinutes: 60,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        capacity: 1,
        timezone: "UTC",
    };
    const from = new Date("2026-10-20T00:00:00.000Z");
    const to = new Date("2026-10-21T00:00:00.000Z");
    const person = (gapMinutes?: number) => ({
        id: "p",
        hours: [{ dayOfWeek: 2, startMinute: 9 * 60, endMinute: 13 * 60 }],
        extraHours: [],
        timeOff: [],
        // Booked 11:00–12:00.
        busy: [
            {
                startAt: new Date("2026-10-20T11:00:00.000Z"),
                endAt: new Date("2026-10-20T12:00:00.000Z"),
            },
        ],
        ...(gapMinutes === undefined ? {} : { gapMinutes }),
    });
    const starts = (gapMinutes?: number) =>
        personSlots(service, [], person(gapMinutes), "UTC", from, to).map((s) =>
            s.startAt.toISOString().slice(11, 16),
        );

    it("offers back-to-back starts with no gap", () => {
        expect(starts()).toEqual(["09:00", "09:30", "10:00", "12:00"]);
        expect(starts(0)).toEqual(["09:00", "09:30", "10:00", "12:00"]);
    });

    it("keeps the gap clear either side of a booking", () => {
        // 10:00 would end as 11:00 starts; 12:00 would start as it ends.
        expect(starts(15)).toEqual(["09:00", "09:30"]);
        expect(starts(30)).toEqual(["09:00", "09:30"]);
        expect(starts(60)).toEqual(["09:00"]);
    });
});

describe("changes", () => {
    const current = own({ latestBookingMinutes: 120, gapMinutes: 10 });

    it("keeps only what differs, and a null as same as the business", () => {
        expect(
            changedRules(current, {
                latestBookingMinutes: 120,
                gapMinutes: null,
                bookAheadDays: 14,
            }),
        ).toEqual({ gapMinutes: null, bookAheadDays: 14 });
        expect(
            hasChanges(changedRules(current, { latestBookingMinutes: 120 })),
        ).toBe(false);
    });

    it("writes the changes over what is there", () => {
        expect(
            applyRuleChanges(current, { gapMinutes: null, bookAheadDays: 14 }),
        ).toEqual(own({ latestBookingMinutes: 120, bookAheadDays: 14 }));
    });

    it("reads stored changes back with known fields and whole numbers only", () => {
        expect(
            storedRuleChanges({
                latestBookingMinutes: 720,
                gapMinutes: null,
                refundInTimeCancels: false,
                bookAheadDays: "14",
                freeCancelHours: 1.5,
            }),
        ).toEqual({ latestBookingMinutes: 720, gapMinutes: null });
        expect(storedRuleChanges(null)).toEqual({});
        expect(storedRuleChanges([1])).toEqual({});
    });

    it("words a change as the boards do", () => {
        expect(
            changesWords({
                freeCancelHours: 0,
                gapMinutes: 15,
                latestBookingMinutes: 720,
                bookAheadDays: null,
            }),
        ).toEqual([
            "Booking late: up to 12 hours before the start",
            "Booking ahead: same as the business",
            "15 min between bookings",
            "Free to cancel any time before",
        ]);
    });
});

describe("a request's moves", () => {
    it.each([
        ["approve", "APPROVED"],
        ["turn-down", "TURNED_DOWN"],
        ["withdraw", "WITHDRAWN"],
        ["replace", "WITHDRAWN"],
    ] as const)("a waiting request on %s is %s", (move, to) => {
        expect(nextRequestStatus("WAITING", move)).toBe(to);
    });

    it.each(["APPROVED", "TURNED_DOWN", "WITHDRAWN"])(
        "a %s request moves no more",
        (status) => {
            for (const move of [
                "approve",
                "turn-down",
                "withdraw",
                "replace",
            ] as const) {
                expect(nextRequestStatus(status, move)).toBeNull();
            }
        },
    );
});

describe("who changes what at once", () => {
    it("lets whoever sets up bookings change anyone's at once", () => {
        for (const own of [true, false]) {
            for (const needsApproval of [true, false]) {
                expect(
                    ruleChangeRoute({ setsUp: true, own, needsApproval }),
                ).toBe("apply");
            }
        }
    });

    it("makes a Member's own change a request while the switch is on", () => {
        expect(
            ruleChangeRoute({ setsUp: false, own: true, needsApproval: true }),
        ).toBe("request");
        expect(
            ruleChangeRoute({ setsUp: false, own: true, needsApproval: false }),
        ).toBe("apply");
    });

    it("refuses a Member someone else's", () => {
        for (const needsApproval of [true, false]) {
            expect(
                ruleChangeRoute({ setsUp: false, own: false, needsApproval }),
            ).toBe("refuse");
        }
    });
});
