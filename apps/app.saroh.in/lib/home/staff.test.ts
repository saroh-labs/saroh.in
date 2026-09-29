import { describe, expect, it } from "vitest";

import { dateLine } from "./last-day";
import type { HomeLastDay } from "./service";
import { storesOnly } from "./staff";

/** The staff landing's words (round 2, F11). */

const DAY: HomeLastDay = {
    zone: "Asia/Kolkata",
    date: "2026-09-18",
    partOfDay: "morning",
    since: "2026-09-17T04:00:00.000Z",
    fresh: false,
    items: [],
};

describe("storesOnly", () => {
    it("names the one storefront a staff member works on", () => {
        expect(
            storesOnly({
                stores: [{ id: "s1", name: "Hill Road" }],
                ownDiary: false,
            }),
        ).toBe("Hill Road only");
    });

    it("names several as a list", () => {
        expect(
            storesOnly({
                stores: [
                    { id: "s1", name: "Hill Road" },
                    { id: "s2", name: "Bandra" },
                    { id: "s3", name: "Online" },
                ],
                ownDiary: false,
            }),
        ).toBe("Hill Road, Bandra and Online only");
    });

    it("says nothing when the Home covers every storefront", () => {
        expect(storesOnly({ stores: null, ownDiary: true })).toBeNull();
        expect(storesOnly(null)).toBeNull();
        expect(storesOnly({ stores: [], ownDiary: false })).toBeNull();
    });
});

describe("dateLine for a staff member", () => {
    it("adds the storefronts after the business, as the design writes it", () => {
        expect(dateLine(DAY, "Rye & Co.", "Hill Road only")).toBe(
            "Friday 18 September · Rye & Co. · Hill Road only",
        );
    });

    it("is the business's line when nothing is narrowed", () => {
        expect(dateLine(DAY, "Rye & Co.", null)).toBe(
            "Friday 18 September · Rye & Co.",
        );
    });

    it("still names the storefronts without the header's read", () => {
        expect(dateLine(null, "Rye & Co.", "Hill Road only")).toBe(
            "Rye & Co. · Hill Road only",
        );
    });
});
