import { describe, expect, it } from "vitest";

import { decodeQr } from "../../test-qr";
import { reviewLinkProblem } from "./logic";

describe("reviewLinkProblem", () => {
    it("takes the links Google gives for reviews", () => {
        expect(
            reviewLinkProblem("https://g.page/r/CSampleRyeStudio/review"),
        ).toBeNull();
        expect(
            reviewLinkProblem(
                "https://search.google.com/local/writereview?placeid=ChIJSample123",
            ),
        ).toBeNull();
    });

    it("says a Maps link opens the listing, not the review box", () => {
        expect(reviewLinkProblem("https://maps.app.goo.gl/AbC123")).toBe(
            "maps",
        );
        expect(
            reviewLinkProblem("https://www.google.com/maps/place/Rye+Studio"),
        ).toBe("maps");
        expect(reviewLinkProblem("https://g.page/rye-studio")).toBe("maps");
    });

    it("tells another link from no link", () => {
        expect(reviewLinkProblem("https://example.com/rye-studio")).toBe(
            "not-review",
        );
        expect(reviewLinkProblem("g.page/r/CSample/review")).toBe("not-link");
    });

    it("the code holds the link and nothing else", () => {
        const link = "https://g.page/r/CSampleRyeStudio/review";
        expect(decodeQr(link)).toBe(link);
    });
});
