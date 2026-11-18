import { goodTimes, SPREAD_MINUTES } from "./good-time";

/** "Good time" (R3, S-07): evenings and lunchtimes, each business on its own minute. */
const now = new Date("2026-11-18T06:30:00Z"); // Wed, 12:00 in Kolkata
const ZONE = "Asia/Kolkata";
const local = (d: Date) =>
    d.toLocaleString("en-GB", {
        timeZone: ZONE,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
    });

describe("goodTimes", () => {
    it("offers weekday evenings and weekend lunchtimes", () => {
        expect(goodTimes(now, ZONE).map(local)).toEqual([
            "Wed 19:30",
            "Thu 19:30",
            "Fri 19:30",
        ]);
    });

    it("spreads businesses over minutes past the half hour, the same each time for one", () => {
        const minutes = new Set<number>();
        for (let i = 0; i < 40; i++) {
            const [first] = goodTimes(now, ZONE, `org_${i}`);
            const m = Number(local(first).slice(-2));
            expect(m).toBeGreaterThanOrEqual(30);
            expect(m).toBeLessThanOrEqual(30 + SPREAD_MINUTES);
            minutes.add(m);
        }
        expect(minutes.size).toBeGreaterThan(5);
        expect(goodTimes(now, ZONE, "org_1")).toEqual(
            goodTimes(now, ZONE, "org_1"),
        );
    });
});
