import { describe, expect, it } from "vitest";

import {
    hoursBackwards,
    hoursSummary,
    isUniform,
    weekSummary,
} from "./opening-hours-summary";
import type { OpeningHoursDay, Weekday } from "./storefronts";

/** The place's "Opening hours" row, in one line. Made-up weeks only. */

const DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** A week open 9 to 6, with the named days closed or on other hours. */
const week = (
    over: Partial<Record<Weekday, Partial<OpeningHoursDay>>> = {},
): OpeningHoursDay[] =>
    DAYS.map((day) => ({
        day,
        open: "09:00",
        close: "18:00",
        closed: false,
        ...over[day],
    }));

describe("hoursSummary", () => {
    it("says Not set yet for a week never saved", () => {
        expect(hoursSummary(null)).toBe("Not set yet");
    });

    it("says the open days and the hours they share", () => {
        expect(hoursSummary(week({ SUN: { closed: true } }))).toBe(
            "Mon–Sat · 9:00 AM – 6:00 PM",
        );
        expect(hoursSummary(week())).toBe("Mon–Sun · 9:00 AM – 6:00 PM");
        expect(
            hoursSummary(
                week({ SAT: { closed: true }, SUN: { closed: true } }),
            ),
        ).toBe("Mon–Fri · 9:00 AM – 6:00 PM");
    });

    it("names days that aren't neighbours one by one", () => {
        expect(
            hoursSummary(
                week({
                    THU: { closed: true },
                    SAT: { closed: true },
                    SUN: { closed: true },
                }),
            ),
        ).toBe("Mon–Wed, Fri · 9:00 AM – 6:00 PM");
        expect(
            hoursSummary(
                week({
                    MON: { closed: true },
                    TUE: { closed: true },
                    WED: { closed: true },
                    THU: { closed: true },
                    FRI: { closed: true },
                    SUN: { closed: true },
                }),
            ),
        ).toBe("Sat · 9:00 AM – 6:00 PM");
    });

    it("counts the open days on other hours, and not the closed ones", () => {
        expect(
            hoursSummary(
                week({
                    SAT: { open: "10:00", close: "14:00" },
                    SUN: { closed: true },
                }),
            ),
        ).toBe("Mon–Fri · 9:00 AM – 6:00 PM + 1 day with different hours");
        expect(
            hoursSummary(
                week({
                    SAT: { open: "10:00", close: "14:00" },
                    SUN: { open: "11:00", close: "13:00" },
                }),
            ),
        ).toBe("Mon–Fri · 9:00 AM – 6:00 PM + 2 days with different hours");
    });

    it("leads with the hours most days keep; a tie goes to the earlier days", () => {
        expect(
            hoursSummary(
                week({
                    MON: { open: "12:00", close: "20:00" },
                    SUN: { closed: true },
                }),
            ),
        ).toBe("Tue–Sat · 9:00 AM – 6:00 PM + 1 day with different hours");
        expect(
            hoursSummary(
                week({
                    WED: { open: "12:00", close: "20:00" },
                    THU: { open: "12:00", close: "20:00" },
                    FRI: { closed: true },
                    SAT: { closed: true },
                    SUN: { closed: true },
                }),
            ),
        ).toBe("Mon–Tue · 9:00 AM – 6:00 PM + 2 days with different hours");
    });

    it("says Closed every day for a saved week with no open day", () => {
        expect(
            hoursSummary(
                week(
                    Object.fromEntries(
                        DAYS.map((d) => [d, { closed: true }]),
                    ) as Record<Weekday, Partial<OpeningHoursDay>>,
                ),
            ),
        ).toBe("Closed every day");
    });
});

describe("the editor's own readings of a week", () => {
    it("weekSummary writes it as a shop's door does", () => {
        expect(weekSummary(week({ SUN: { closed: true } }))).toBe(
            "Mon–Sat 9:00 AM – 6:00 PM · Sun closed",
        );
        expect(
            weekSummary(
                week({
                    SAT: { open: "10:00", close: "14:00" },
                    SUN: { closed: true },
                }),
            ),
        ).toBe(
            "Mon–Fri 9:00 AM – 6:00 PM · Sat 10:00 AM – 2:00 PM · Sun closed",
        );
    });

    it("isUniform: every open day keeps the same hours", () => {
        expect(isUniform(week({ SUN: { closed: true } }))).toBe(true);
        expect(isUniform(week({ SAT: { close: "14:00" } }))).toBe(false);
    });

    it("hoursBackwards: an open day that closes before it opens", () => {
        expect(hoursBackwards(week())).toBe(false);
        expect(hoursBackwards(week({ TUE: { close: "08:00" } }))).toBe(true);
        // A closed day's times are never read.
        expect(
            hoursBackwards(week({ TUE: { close: "08:00", closed: true } })),
        ).toBe(false);
    });
});
