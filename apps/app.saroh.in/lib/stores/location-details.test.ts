import { describe, expect, it } from "vitest";

import type { LocationDetails } from "./location-details";
import {
    detailsEmpty,
    detailsOf,
    detailsSummary,
    LOGO_STATE,
    logoSource,
    shownLogo,
} from "./location-details";

/** The place's read-first "Description and logo" row. Made-up values only. */
const RYE = "https://cdn.example.com/rye.png";
const OWN = { url: "https://cdn.example.com/hill.png", mediaId: "m_hill" };
const details = (over: Partial<LocationDetails> = {}): LocationDetails => ({
    description: null,
    logo: null,
    businessLogo: null,
    ...over,
});

describe("logoSource — own, then the business's, then none (DEC-120)", () => {
    it("its own logo wins over the business's", () => {
        expect(logoSource(details({ logo: OWN, businessLogo: RYE }))).toBe(
            "own",
        );
        expect(shownLogo(details({ logo: OWN, businessLogo: RYE }))).toBe(
            OWN.url,
        );
    });

    it("with none of its own it uses the business logo", () => {
        expect(logoSource(details({ businessLogo: RYE }))).toBe("business");
        expect(shownLogo(details({ businessLogo: RYE }))).toBe(RYE);
        expect(LOGO_STATE.business).toBe("Using your business logo");
    });

    it("with neither there is none", () => {
        expect(logoSource(details())).toBe("none");
        expect(shownLogo(details())).toBeNull();
    });
});

describe("detailsSummary", () => {
    const told = "Sourdough since 2019";

    it.each([
        [
            details({ description: told, logo: OWN, businessLogo: RYE }),
            "Description added · own logo",
        ],
        [
            details({ description: told, businessLogo: RYE }),
            "Description added · using your business logo",
        ],
        [details({ description: told }), "Description added · no logo yet"],
        [details({ logo: OWN }), "Own logo · no description yet"],
        [
            details({ businessLogo: RYE }),
            "Using your business logo · no description yet",
        ],
        [details({ description: "  " }), "No description yet · no logo yet"],
    ])("says what is true of the description and the logo", (saved, says) => {
        expect(detailsSummary(saved)).toBe(says);
    });

    it("is empty only with no description and no logo to show", () => {
        expect(detailsEmpty(details())).toBe(true);
        expect(detailsEmpty(details({ description: "Bread" }))).toBe(false);
        expect(detailsEmpty(details({ businessLogo: RYE }))).toBe(false);
        expect(detailsEmpty(details({ logo: OWN }))).toBe(false);
    });
});

describe("detailsOf — what the store read says", () => {
    it("takes the location's own logo and the business's", () => {
        expect(
            detailsOf({
                description: "Bread",
                logo: OWN.url,
                ownLogo: OWN,
                businessLogo: { url: RYE },
            }),
        ).toEqual({ description: "Bread", logo: OWN, businessLogo: RYE });
    });

    it("no logo of its own leaves the business's to use", () => {
        expect(
            detailsOf({
                logo: null,
                ownLogo: null,
                businessLogo: { url: RYE },
            }),
        ).toEqual({ description: null, logo: null, businessLogo: RYE });
    });

    it("an address typed in before uploads is its own, with no library image", () => {
        const typed = "https://example.com/logo.png";
        expect(
            detailsOf({
                logo: typed,
                ownLogo: { url: typed, mediaId: null },
                businessLogo: null,
            }).logo,
        ).toEqual({ url: typed, mediaId: null });
        // An API that doesn't send the logos yet still has the address.
        expect(detailsOf({ logo: typed }).logo).toEqual({
            url: typed,
            mediaId: null,
        });
        expect(detailsOf({ logo: null })).toEqual({
            description: null,
            logo: null,
            businessLogo: null,
        });
    });
});
