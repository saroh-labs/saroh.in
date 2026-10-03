import { describe, expect, it } from "vitest";

import { addMonthsUtc, moveDateFor } from "./moves";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("moveDateFor", () => {
    it("takes the first renewal at least 7 days after go-live", () => {
        // Renews 3 Oct, live 1 Oct: 3 Oct is too soon (before 8 Oct), so 3 Nov.
        expect(moveDateFor(d("2026-10-03"), d("2026-10-01"))).toEqual(
            d("2026-11-03"),
        );
    });

    it("keeps a renewal exactly 7 days out, or later", () => {
        expect(moveDateFor(d("2026-10-08"), d("2026-10-01"))).toEqual(
            d("2026-10-08"),
        );
        expect(moveDateFor(d("2026-10-20"), d("2026-10-01"))).toEqual(
            d("2026-10-20"),
        );
    });

    it("steps a yearly subscription by a year", () => {
        expect(moveDateFor(d("2026-10-03"), d("2026-10-01"), "year")).toEqual(
            d("2027-10-03"),
        );
    });

    it("steps from a renewal already in the past", () => {
        expect(moveDateFor(d("2026-08-15"), d("2026-10-01"))).toEqual(
            d("2026-10-15"),
        );
    });

    it("keeps month-end renewals at the month's end", () => {
        expect(addMonthsUtc(d("2026-01-31"), 1)).toEqual(d("2026-02-28"));
        expect(moveDateFor(d("2026-01-31"), d("2026-01-30"))).toEqual(
            d("2026-02-28"),
        );
        expect(moveDateFor(d("2026-01-31"), d("2026-02-25"))).toEqual(
            d("2026-03-31"),
        );
    });
});
