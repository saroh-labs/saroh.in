import {
    bookingWindowRefusal,
    freeCancelDeadline,
    isLateCancel,
    NO_BOOKING_RULES,
    withinBookingWindow,
} from "./booking-rules";

const NOW = new Date("2026-07-20T09:00:00Z");
const at = (hoursFromNow: number) =>
    new Date(NOW.getTime() + hoursFromNow * 3_600_000);

describe("booking rules (U3)", () => {
    it("no rules: every start is bookable and every cancel is in time", () => {
        expect(bookingWindowRefusal(at(0.1), NOW, NO_BOOKING_RULES)).toBeNull();
        expect(bookingWindowRefusal(at(24 * 400), NOW, NO_BOOKING_RULES)).toBe(
            null,
        );
        expect(isLateCancel({ startAt: at(0.5) }, NOW, NO_BOOKING_RULES)).toBe(
            false,
        );
    });

    it("refuses a start later than the latest-booking rule allows", () => {
        const rules = { ...NO_BOOKING_RULES, latestBookingMinutes: 120 };
        expect(bookingWindowRefusal(at(1), NOW, rules)).toEqual({
            message:
                "Bookings close 2 hours before the start. Pick a later time.",
            field: "startAt",
        });
        expect(bookingWindowRefusal(at(2), NOW, rules)).toBeNull();
    });

    it("refuses a start further ahead than book-ahead", () => {
        const rules = { ...NO_BOOKING_RULES, bookAheadDays: 14 };
        expect(withinBookingWindow(at(24 * 14), NOW, rules)).toBe(true);
        const refusal = bookingWindowRefusal(at(24 * 15), NOW, rules);
        expect(refusal?.field).toBe("startAt");
        expect(refusal?.message).toMatch(/14 days ahead/);
    });

    it("a cancel inside the free-cancellation window is late", () => {
        const rules = { ...NO_BOOKING_RULES, freeCancelHours: 12 };
        expect(isLateCancel({ startAt: at(13) }, NOW, rules)).toBe(false);
        expect(isLateCancel({ startAt: at(12) }, NOW, rules)).toBe(false);
        expect(isLateCancel({ startAt: at(11) }, NOW, rules)).toBe(true);
        expect(isLateCancel({ startAt: at(-1) }, NOW, rules)).toBe(true);
    });

    it("fixes the free-cancel deadline at booking: the start less the rule's hours, or none (E8)", () => {
        expect(
            freeCancelDeadline(at(48), { freeCancelHours: 24 })?.toISOString(),
        ).toBe(at(24).toISOString());
        expect(freeCancelDeadline(at(48), { freeCancelHours: null })).toBe(
            null,
        );
    });

    it("judges a booking by the deadline it was given, never by where it was moved (DEC-051)", () => {
        const rules = { ...NO_BOOKING_RULES, freeCancelHours: 24 };
        // Made for three days out (deadline in two days), then moved a week
        // later: cancelled on the old last day, it is still in time...
        const booking = { startAt: at(24 * 10), freeCancelUntil: at(48) };
        expect(isLateCancel(booking, at(47), rules)).toBe(false);
        // ...and a moment after the fixed deadline it is late, though the
        // new start is a week away.
        expect(isLateCancel(booking, at(49), rules)).toBe(true);
    });

    it("a booking made before the column is judged by its start, as before", () => {
        const rules = { ...NO_BOOKING_RULES, freeCancelHours: 12 };
        expect(
            isLateCancel(
                { startAt: at(13), freeCancelUntil: null },
                NOW,
                rules,
            ),
        ).toBe(false);
        expect(
            isLateCancel(
                { startAt: at(11), freeCancelUntil: null },
                NOW,
                rules,
            ),
        ).toBe(true);
    });
});
