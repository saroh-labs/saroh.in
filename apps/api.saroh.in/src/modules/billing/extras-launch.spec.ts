/**
 * Extras on a yearly offer plan (DEC-239): the launch percent only on what
 * falls in the subscription's first months. Made-up figures (an add-on at
 * 1,000 a year, a 10% offer for 3 months), never a real price or offer.
 */
import { withLaunchOff } from "./extras-launch";
import type { AddonChargeLine } from "./offers";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

// A year from 1 Jan 2027 (365 days); the window is its first 3 months.
const WINDOW = {
    percentOff: 10,
    start: day("2027-01-01"),
    end: day("2027-04-01"),
};

const line = (start: string, end: string, unitPaise: number) =>
    ({
        addonId: "pack",
        description: "Extra pack",
        quantity: 2,
        unitPaise,
        periodStart: day(start),
        periodEnd: day(end),
    }) satisfies AddonChargeLine;

describe("withLaunchOff (DEC-239)", () => {
    it("takes the percent off only the part inside the first months", () => {
        // Bought on 1 Feb: 334 days to the year's end, 59 of them in the
        // window. 10% of 59/334 of 91,507 is 1,616.44… → 1,616 a unit.
        const out = withLaunchOff(
            line("2027-02-01", "2028-01-01", 91_507),
            WINDOW,
        );
        expect(out.unitPaise).toBe(91_507 - 1_616);
        expect(out.quantity).toBe(2);
        expect(out.description).toBe("Extra pack, launch offer");
    });

    it("the whole of a line inside the window gets the whole percent", () => {
        expect(
            withLaunchOff(line("2027-01-01", "2027-04-01", 10_000), WINDOW)
                .unitPaise,
        ).toBe(9_000);
    });

    it("counts from the plan's start: an extra added after the window is regular", () => {
        const late = line("2027-05-01", "2028-01-01", 66_600);
        expect(withLaunchOff(late, WINDOW)).toEqual(late);
        // A renewal year's extras are regular too.
        const next = line("2028-01-01", "2029-01-01", 100_000);
        expect(withLaunchOff(next, WINDOW)).toEqual(next);
    });

    it("without a window (no offer, or a business that had one) nothing changes", () => {
        const l = line("2027-01-01", "2028-01-01", 100_000);
        expect(withLaunchOff(l, null)).toEqual(l);
    });
});
