import { daysLate } from "./overdue-bills";

describe("daysLate (DEC-269)", () => {
    // Due 8 Nov, the end of that day in India, as a due date is stored.
    const due = new Date("2026-11-08T18:29:59.999Z");
    const IST = "Asia/Kolkata";

    it("counts calendar days in the business's zone, not 24-hour blocks", () => {
        // 26 Nov, 10 am in India: 17 days and hours after, 18 by the day.
        expect(daysLate(due, new Date("2026-11-26T04:30:00.000Z"), IST)).toBe(
            18,
        );
    });

    it("moves on at the business's midnight", () => {
        expect(daysLate(due, new Date("2026-11-09T18:29:00.000Z"), IST)).toBe(
            1,
        );
        expect(daysLate(due, new Date("2026-11-09T18:31:00.000Z"), IST)).toBe(
            2,
        );
    });

    it("is 0 before the moment, and at least 1 just after it", () => {
        expect(daysLate(due, new Date("2026-11-08T12:00:00.000Z"), IST)).toBe(
            0,
        );
        expect(daysLate(null, new Date(), IST)).toBe(0);
        const nine = new Date("2026-11-08T03:30:00.000Z");
        expect(daysLate(nine, new Date("2026-11-08T04:30:00.000Z"), IST)).toBe(
            1,
        );
    });

    it("reads the business's day, ahead of UTC and behind it", () => {
        const at = new Date("2026-11-08T20:00:00.000Z");
        const now = new Date("2026-11-10T02:00:00.000Z");
        expect(daysLate(at, now, "Pacific/Auckland")).toBe(1);
        expect(daysLate(at, now, "America/New_York")).toBe(1);
        expect(daysLate(at, now, "UTC")).toBe(2);
    });
});
