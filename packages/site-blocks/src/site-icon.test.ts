import { describe, expect, it } from "vitest";

import {
    plainSiteIconDataUrl,
    plainSiteIconSvg,
    siteInitial,
} from "./site-icon";

describe("a site's initial", () => {
    it("is the first letter of its name, in capitals", () => {
        expect(siteInitial("rye & co.")).toBe("R");
        expect(siteInitial("  Northwind Supply")).toBe("N");
    });

    it("skips what is not a letter or a digit", () => {
        expect(siteInitial("“Kiln” studio")).toBe("K");
        expect(siteInitial("#1 Bakes")).toBe("1");
    });

    it("keeps a letter of any script whole", () => {
        expect(siteInitial("आशा राव")).toBe("आ");
        expect(siteInitial("Élan")).toBe("É");
    });

    it("is empty for a name with no letter or digit", () => {
        expect(siteInitial("")).toBe("");
        expect(siteInitial(null)).toBe("");
        expect(siteInitial(" · — ")).toBe("");
    });
});

describe("the plain site icon", () => {
    it("draws the initial on the site's accent, in the accent's text colour", () => {
        const svg = plainSiteIconSvg({
            name: "Rye",
            variables: {
                "--site-accent": "150 33% 18%",
                "--site-accent-fg": "0 0% 98%",
            },
        });
        expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
        expect(svg).toContain('fill="hsl(150 33% 18%)"');
        expect(svg).toContain('fill="hsl(0 0% 98%)"');
        expect(svg).toContain(">R</text>");
    });

    it("falls back to the neutral tile for a site with no look saved", () => {
        for (const variables of [undefined, null, {}]) {
            const svg = plainSiteIconSvg({ name: "Rye", variables });
            expect(svg).toContain('fill="hsl(24 10% 10%)"');
            expect(svg).toContain('fill="hsl(0 0% 100%)"');
        }
    });

    it("never writes a snapshot's value into the file unless it is a plain HSL triple", () => {
        const svg = plainSiteIconSvg({
            name: "Rye",
            variables: {
                "--site-accent": '"/><script>alert(1)</script>',
                "--site-accent-fg": "url(https://evil.test/x)",
            },
        });
        expect(svg).not.toContain("script");
        expect(svg).not.toContain("evil.test");
        expect(svg).toContain('fill="hsl(24 10% 10%)"');
    });

    it("escapes the initial, and draws a plain tile without one", () => {
        expect(plainSiteIconSvg({ name: "<b>" })).toContain(">B</text>");
        const bare = plainSiteIconSvg({ name: " · " });
        expect(bare).not.toContain("<text");
        expect(bare).toContain("<rect");
    });

    it("carries no Saroh colour, name or mark", () => {
        const svg = plainSiteIconSvg({ name: "Saffron Kitchen" });
        expect(svg).not.toMatch(/saroh/i);
        // Saffron 500 and Ink, as hex and as the mark's path.
        expect(svg).not.toMatch(/#D98A15|#1C1C1A|<path/i);
    });

    it("is the same bytes as a data address, for a preview", () => {
        const input = { name: "Rye" };
        expect(plainSiteIconDataUrl(input)).toBe(
            `data:image/svg+xml,${encodeURIComponent(plainSiteIconSvg(input))}`,
        );
    });
});
