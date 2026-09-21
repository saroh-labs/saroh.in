import { discountState } from "./discount-state";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-09-21T12:00:00.000Z");
const open = { startsAt: null, endsAt: null, usageLimit: null };

describe("discountState", () => {
    it("a code with no window and no cap is always Active", () => {
        expect(discountState(open, 999, NOW)).toBe("ACTIVE");
    });

    it("is Scheduled before it starts, Active from its first instant", () => {
        const w = { ...open, startsAt: at("2026-09-21T12:00:00.001Z") };
        expect(discountState(w, 0, NOW)).toBe("SCHEDULED");
        expect(discountState(w, 0, at("2026-09-21T12:00:00.001Z"))).toBe(
            "ACTIVE",
        );
    });

    it("is Active at its end instant and Expired the instant after", () => {
        const w = { ...open, endsAt: NOW };
        expect(discountState(w, 0, NOW)).toBe("ACTIVE");
        expect(discountState(w, 0, at("2026-09-21T12:00:00.001Z"))).toBe(
            "EXPIRED",
        );
    });

    it("is Exhausted exactly at its cap, Active one below", () => {
        const w = { ...open, usageLimit: 100 };
        expect(discountState(w, 100, NOW)).toBe("EXHAUSTED");
        expect(discountState(w, 99, NOW)).toBe("ACTIVE");
    });

    it("an ended code reads as Expired even if it also hit its cap", () => {
        // Only one of the two is fixed by changing a date; the date is the
        // stronger fact.
        const w = {
            ...open,
            endsAt: at("2026-01-01T00:00:00Z"),
            usageLimit: 1,
        };
        expect(discountState(w, 1, NOW)).toBe("EXPIRED");
    });
});
