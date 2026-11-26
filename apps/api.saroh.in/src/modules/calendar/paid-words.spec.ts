import { isFreeBooking, shownPaidWith } from "../bookings/booking-money";
import { paidWords } from "./calendar.service";

/**
 * How a booking was paid, in the Business calendar's day panel, and the one
 * free-booking rule every read shares (DEC-261). Pure.
 */
const FREE = { service: { priceCents: 0, currency: "INR" } };
const PAID = { service: { priceCents: 80_000, currency: "INR" } };

describe("a free booking's payment words (DEC-261)", () => {
    it("is free at a price of 0, from the snapshot or an old service's price", () => {
        expect(isFreeBooking(FREE)).toBe(true);
        expect(isFreeBooking(null, 0)).toBe(true);
        // The snapshot wins: a paid booking of a service made free later.
        expect(isFreeBooking(PAID, 0)).toBe(false);
        // No price at all is never free.
        expect(isFreeBooking(null, null)).toBe(false);
        expect(isFreeBooking({ service: {} })).toBe(false);
    });

    it("reads an old free 'at the desk' as no way to pay, and keeps the rest", () => {
        expect(shownPaidWith("DESK", true)).toBeNull();
        expect(shownPaidWith("DESK", false)).toBe("DESK");
        expect(shownPaidWith("PACK", true)).toBe("PACK");
    });

    it("says Free on the Business calendar, never At the desk", () => {
        const at = (paidWith: string | null, snapshot: unknown) =>
            paidWords({
                paidWith,
                snapshot,
                service: { priceCents: null },
            });
        expect(at("DESK", FREE)).toBe("Free");
        expect(at(null, FREE)).toBe("Free");
        expect(at("DESK", PAID)).toBe("At the desk");
        expect(at(null, null)).toBeNull();
    });
});
