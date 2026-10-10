import { describe, expect, it } from "vitest";

import type { SiteDetail } from "./service";
import {
    plainSiteIcon,
    shownSiteIcon,
    SITE_ICON_LINE,
    SITE_ICON_REMOVE,
    siteIconFileProblem,
    siteIconOf,
    siteIconShapeNote,
} from "./site-icon";

const OWN = "https://media.example.com/org/o1/site-image/icon.png";
const LOGO = "https://media.example.com/org/o1/business-logo/logo.png";
const rye = { name: "Rye" };

describe("which icon a site shows", () => {
    it("its own, else the business logo, else the plain tile", () => {
        expect(shownSiteIcon(rye, OWN, LOGO)).toEqual({
            source: "own",
            src: OWN,
        });
        expect(shownSiteIcon(rye, null, LOGO)).toEqual({
            source: "logo",
            src: LOGO,
        });
        const plain = shownSiteIcon(rye, null, null);
        expect(plain.source).toBe("plain");
        expect(decodeURIComponent(plain.src)).toContain(">R</text>");
    });

    it("draws nothing from an address that isn't on the web", () => {
        expect(shownSiteIcon(rye, "javascript:alert(1)", LOGO).source).toBe(
            "logo",
        );
        expect(shownSiteIcon(rye, "/icon.png", "data:x").source).toBe("plain");
    });

    it("says each in one line, and what removing leaves", () => {
        expect(SITE_ICON_LINE).toEqual({
            own: "Your own icon",
            logo: "Using your business logo",
            plain: "A plain icon with your initial",
        });
        expect(SITE_ICON_REMOVE).toEqual({
            logo: "Use your business logo",
            plain: "Use the plain icon",
        });
    });

    it("reads an older API's site as neither", () => {
        expect(siteIconOf({})).toEqual({ own: null, businessLogoUrl: null });
        const icon = { own: null, businessLogoUrl: LOGO };
        expect(siteIconOf({ icon })).toBe(icon);
    });
});

describe("the plain tile, in the workspace", () => {
    it("is the site's draft accent with its text, from the look as saved", () => {
        const site = {
            name: "Kiln",
            style: { colours: { accent: "moss" }, scalars: {} },
            styleOptions: {
                rows: [
                    {
                        key: "accent",
                        label: "Accent",
                        swatches: [
                            { key: "ink", label: "Ink", hsl: "24 10% 10%" },
                            { key: "moss", label: "Moss", hsl: "150 33% 18%" },
                        ],
                    },
                ],
                scalars: [],
            },
        } as unknown as Pick<SiteDetail, "name" | "style" | "styleOptions">;
        const svg = decodeURIComponent(plainSiteIcon(site));
        expect(svg).toContain("hsl(150 33% 18%)");
        expect(svg).toContain(">K</text>");
    });

    it("is the neutral tile when no look was read", () => {
        expect(decodeURIComponent(plainSiteIcon(rye))).toContain(
            "hsl(24 10% 10%)",
        );
    });
});

describe("what an icon file may be", () => {
    it("takes a PNG, JPG or WebP of 1 MB or less", () => {
        for (const type of ["image/png", "image/jpeg", "image/webp"]) {
            expect(siteIconFileProblem({ type, size: 1024 * 1024 })).toBe("");
        }
    });

    it("refuses an SVG, a GIF and a larger file, in words", () => {
        expect(siteIconFileProblem({ type: "image/svg+xml", size: 10 })).toBe(
            "That file isn't a PNG, JPG or WebP image.",
        );
        expect(siteIconFileProblem({ type: "image/gif", size: 10 })).toBe(
            "That file isn't a PNG, JPG or WebP image.",
        );
        expect(
            siteIconFileProblem({ type: "image/png", size: 1024 * 1024 + 1 }),
        ).toBe("That image is over 1 MB. Choose a smaller one.");
    });

    it("notes a shape that will look worse, and never refuses it", () => {
        expect(siteIconShapeNote({ width: 512, height: 512 })).toBeNull();
        expect(siteIconShapeNote({ width: 640, height: 320 })).toMatch(
            /isn't square/,
        );
        expect(siteIconShapeNote({ width: 64, height: 64 })).toBe(
            "This image is 64 × 64. It may look soft on a phone; 192 × 192 or larger is sharper.",
        );
        // Unknown size: nothing to say.
        expect(siteIconShapeNote({})).toBeNull();
    });
});
