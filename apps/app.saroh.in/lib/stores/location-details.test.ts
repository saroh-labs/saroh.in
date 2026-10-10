import { describe, expect, it } from "vitest";

import { detailsEmpty, detailsSummary } from "./location-details";

/** The place's read-first "Description and logo" row. Made-up values only. */
describe("detailsSummary", () => {
    it("says what is saved of the description and logo", () => {
        expect(
            detailsSummary({
                description: "Sourdough since 2019",
                logo: "https://example.com/logo.png",
            }),
        ).toBe("Description and logo added");
        expect(
            detailsSummary({ description: "Sourdough since 2019", logo: null }),
        ).toBe("Description added, no logo yet");
        expect(
            detailsSummary({
                description: null,
                logo: "https://example.com/logo.png",
            }),
        ).toBe("Logo added, no description yet");
        expect(detailsSummary({ description: "  ", logo: "" })).toBe(
            "No description or logo yet",
        );
    });

    it("is empty only with neither", () => {
        expect(detailsEmpty({ description: null, logo: null })).toBe(true);
        expect(detailsEmpty({ description: "Bread", logo: null })).toBe(false);
    });
});
