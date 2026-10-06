/**
 * A website order to pay on handover that nobody came for (R34): from the
 * third day after it was placed, counted in the business's calendar, until
 * it is paid, handed over or cancelled. Pure.
 */
import {
    awaitsHandover,
    daysSincePlaced,
    uncollectedDays,
    uncollectedFrom,
    uncollectedTag,
    uncollectedWhere,
} from "./uncollected";

const ZONE = "Asia/Kolkata";
// Monday 5 Oct 2026, 22:00 in Kolkata (16:30 UTC).
const PLACED = new Date("2026-10-05T16:30:00.000Z");

const order = (over: Partial<Parameters<typeof uncollectedDays>[0]> = {}) => ({
    payOnHandover: true,
    paymentStatus: "UNPAID",
    status: "PROCESSING",
    createdAt: PLACED,
    ...over,
});

/** An instant in Kolkata, as `YYYY-MM-DDTHH:mm`. */
const at = (local: string) => new Date(`${local}:00.000+05:30`);

describe("an order to pay on handover nobody came for (R34)", () => {
    it("isn't one before the third day, however late on the second", () => {
        expect(uncollectedDays(order(), at("2026-10-07T23:59"), ZONE)).toBe(
            null,
        );
    });

    it("is one from the start of the third day, in the business's zone", () => {
        expect(uncollectedDays(order(), at("2026-10-08T00:00"), ZONE)).toBe(3);
        expect(uncollectedFrom(PLACED, ZONE)).toEqual(at("2026-10-08T00:00"));
    });

    it("counts the days up while it keeps waiting", () => {
        expect(uncollectedDays(order(), at("2026-10-09T10:00"), ZONE)).toBe(4);
        expect(uncollectedDays(order(), at("2026-10-15T10:00"), ZONE)).toBe(10);
    });

    it("counts in the business's calendar, not UTC's", () => {
        // 16:30 UTC on the 5th is the 5th in London but the 6th in Tokyo.
        expect(daysSincePlaced(PLACED, at("2026-10-08T06:00"), "UTC")).toBe(3);
        expect(
            daysSincePlaced(PLACED, at("2026-10-08T06:00"), "Asia/Tokyo"),
        ).toBe(2);
    });

    it("goes once it is paid, handed over or cancelled", () => {
        const later = at("2026-10-10T10:00");
        expect(
            uncollectedDays(order({ paymentStatus: "PAID" }), later, ZONE),
        ).toBe(null);
        expect(
            uncollectedDays(order({ status: "DELIVERED" }), later, ZONE),
        ).toBe(null);
        expect(
            uncollectedDays(order({ status: "CANCELLED" }), later, ZONE),
        ).toBe(null);
        expect(
            uncollectedDays(order({ paymentStatus: "REFUNDED" }), later, ZONE),
        ).toBe(null);
    });

    it("is only an order placed to be paid on handover", () => {
        expect(
            uncollectedDays(
                order({ payOnHandover: false }),
                at("2026-10-10T10:00"),
                ZONE,
            ),
        ).toBe(null);
    });

    it("stays while a pay-link payment failed, or it is out for delivery", () => {
        expect(awaitsHandover(order({ paymentStatus: "FAILED" }))).toBe(true);
        expect(awaitsHandover(order({ status: "SHIPPED" }))).toBe(true);
        expect(awaitsHandover(order({ status: "PENDING" }))).toBe(true);
    });

    it("asks the database for the same orders: placed before the start of two days ago", () => {
        const where = uncollectedWhere("org_1", at("2026-10-08T09:00"), ZONE);
        expect(where).toEqual({
            organizationId: "org_1",
            payOnHandover: true,
            paymentStatus: { in: ["UNPAID", "FAILED"] },
            status: { in: ["PENDING", "PROCESSING", "SHIPPED"] },
            createdAt: { lt: at("2026-10-06T00:00") },
        });
        // Placed on the 5th: before it, so it is one; on the 6th: not yet.
        expect(PLACED.getTime()).toBeLessThan(
            (where.createdAt as { lt: Date }).lt.getTime(),
        );
    });

    it("says it in the order's own words", () => {
        expect(uncollectedTag("PICKUP", 3)).toBe("Not collected: 3 days");
        expect(uncollectedTag("LOCAL_DELIVERY", 4)).toBe(
            "Not delivered: 4 days",
        );
    });
});
