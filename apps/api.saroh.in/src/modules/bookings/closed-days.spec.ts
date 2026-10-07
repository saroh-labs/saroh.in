import { businessClosedOn } from "./closed-days";

/** Monday 12 Oct 2026, midnight to midnight in India. */
const MON = {
    startAt: new Date("2026-10-11T18:30:00Z"),
    endAt: new Date("2026-10-12T18:30:00Z"),
};
/** Sunday 11 Oct 2026 in India. */
const SUN = {
    startAt: new Date("2026-10-10T18:30:00Z"),
    endAt: new Date("2026-10-11T18:30:00Z"),
};
/** Open Monday to Saturday, 10:00–19:00. */
const OPENING = {
    zone: "Asia/Kolkata",
    windows: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        dayOfWeek,
        startMinute: 600,
        endMinute: 1140,
    })),
};

describe("businessClosedOn (UX-054)", () => {
    it("is open on a day inside opening hours, whoever works", () => {
        expect(businessClosedOn(MON, OPENING, [])).toBe(false);
    });

    it("is closed on a day with no opening hours", () => {
        expect(businessClosedOn(SUN, OPENING, [])).toBe(true);
    });

    it("is closed on a day a closure covers whole, not one it covers in part", () => {
        expect(
            businessClosedOn(MON, OPENING, [
                { startAt: SUN.startAt, endAt: MON.endAt },
            ]),
        ).toBe(true);
        expect(
            businessClosedOn(MON, OPENING, [
                {
                    startAt: new Date("2026-10-12T06:30:00Z"),
                    endAt: new Date("2026-10-12T08:30:00Z"),
                },
            ]),
        ).toBe(false);
    });

    it("never calls a day closed with no opening hours known and no closure", () => {
        expect(businessClosedOn(SUN, null, [])).toBe(false);
    });
});
