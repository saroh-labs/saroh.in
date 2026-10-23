import { describe, expect, it } from "vitest";

import { closedWords, fullWords, weekHelp } from "./week-words";

/** What the week says on a closed day and under the grid (U5). */
describe("week words", () => {
    it("names the weekday when it is closed every week, the date when not", () => {
        expect(closedWords({ date: "2026-10-25", closed: "weekly" })).toEqual({
            title: "Closed on Sundays",
            line: "Nobody takes bookings on Sun 25 Oct.",
        });
        expect(closedWords({ date: "2026-10-22", closed: "day" }).title).toBe(
            "Closed on Thu 22 Oct",
        );
    });

    it("says how full in words", () => {
        expect(fullWords(0)).toBe("nothing booked yet");
        expect(fullWords(0.2)).toBe("a little booked");
        expect(fullWords(0.5)).toBe("about half full");
        expect(fullWords(0.8)).toBe("mostly full");
        expect(fullWords(1)).toBe("full");
    });

    it("names the lanes and what a click does, by role", () => {
        expect(
            weekHelp({
                lanes: ["Meera Iyer", "Arjun Rao"],
                canBook: true,
                phone: false,
            }),
        ).toBe(
            "Each day has a lane per person: Meera, Arjun. The bar under each day shows how full it is. Click a day to open it, a free time to book or block it.",
        );
        expect(weekHelp({ lanes: [], canBook: false, phone: false })).toBe(
            "The bar under each day shows how full it is. Click a day to open it.",
        );
        expect(
            weekHelp({ lanes: [], canBook: true, phone: true, free: false }),
        ).toBe(
            "The bar on each day shows how full it is. Tap a day to see its bookings. Swipe left or right for the week before or after.",
        );
    });
});
