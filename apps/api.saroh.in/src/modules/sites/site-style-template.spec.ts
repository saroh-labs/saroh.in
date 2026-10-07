import { BadRequestException } from "@nestjs/common";
import type { TemplateManifest } from "@saroh/templates";
import { hexToHslTriple } from "@saroh/templates";

import {
    defaultSiteStyle,
    parseSiteStyle,
    siteStyleOptions,
    siteStyleVariables,
} from "./site-style";
import {
    assertTemplateLookOffered,
    templateColourways,
} from "./site-style-offer";

/**
 * A template's own palette and type scale (DEC-090): exact colours checked
 * to 4.5:1, a bounded type scale, and the rule that a merchant reaches
 * either only as one of their template's colourways.
 */

const GREEN = {
    bg: "#F4F1E8",
    surface: "#EAE6DB",
    fg: "#1A1815",
    body: "#3B362E",
    muted: "#6E685E",
    border: "#DFDACD",
    accent: "#1F3D2B",
    accentFg: "#F9F7F1",
};
const OXBLOOD = {
    ...GREEN,
    bg: "#F1F1F4",
    surface: "#DADADE",
    accent: "#4F2927",
};
const TYPE = { measure: 64, bodySize: 16, labelStyle: "eyebrowAccent" };

const ceramics: Pick<TemplateManifest, "id" | "version" | "styles"> = {
    id: "ceramics",
    version: 1,
    styles: [
        {
            id: "green",
            name: "Green",
            style: {
                palette: GREEN,
                type: TYPE as never,
                scalars: { gridGap: 1 },
                fontPair: "fraunces-inter-tight",
            },
        },
        {
            id: "oxblood",
            name: "Oxblood",
            style: { palette: OXBLOOD, type: TYPE as never },
        },
    ],
};

function refusal(fn: () => unknown): {
    field?: string;
    problems?: { field: string }[];
} {
    try {
        fn();
    } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const body = (error as BadRequestException).getResponse() as {
            details?: { field?: string; problems?: { field: string }[] };
        };
        return body.details ?? {};
    }
    throw new Error("expected a refusal");
}

describe("parseSiteStyle: a template's palette", () => {
    it("accepts exact colours and stores them complete, in capitals", () => {
        const style = parseSiteStyle({ palette: { ...GREEN, bg: "#f4f1e8" } });
        expect(style.palette?.bg).toBe("#F4F1E8");
        expect(style.palette?.ctaBg).toBe("#1F3D2B");
    });

    it("refuses a value that is not #RRGGBB, naming the field", () => {
        for (const bad of ["#FFF", "green", "var(--x)", "#1F3D2B;}"]) {
            const details = refusal(() =>
                parseSiteStyle({ palette: { ...GREEN, accent: bad } }),
            );
            expect(details.field).toBe("palette.accent");
        }
    });

    it("refuses each unreadable pairing with its field, all at once", () => {
        const details = refusal(() =>
            parseSiteStyle({
                palette: { ...GREEN, muted: "#A8A398", accentFg: "#3B362E" },
            }),
        );
        // The call-to-action band takes the accent's pair, so it fails too.
        expect(details.problems?.map((p) => p.field)).toEqual([
            "palette.muted",
            "palette.accentFg",
            "palette.ctaFg",
        ]);
    });

    it("clears with null, like the typeface", () => {
        expect(parseSiteStyle({ palette: null })).not.toHaveProperty("palette");
    });
});

describe("parseSiteStyle: a template's type scale", () => {
    it("accepts a bounded scale", () => {
        expect(parseSiteStyle({ type: TYPE }).type).toEqual(TYPE);
    });

    it("refuses one out of bounds, on the field", () => {
        expect(
            refusal(() => parseSiteStyle({ type: { bodySize: 30 } })).field,
        ).toBe("type.bodySize");
    });

    it("stores plain labels as no type scale at all", () => {
        expect(
            parseSiteStyle({ type: { labelStyle: "plain" } }),
        ).not.toHaveProperty("type");
    });
});

describe("grid gap", () => {
    it("goes down to a 1px hairline for a template", () => {
        expect(
            parseSiteStyle({ scalars: { gridGap: 1 } }).scalars.gridGap,
        ).toBe(1);
        expect(
            parseSiteStyle({ scalars: { gridGap: 0 } }).scalars.gridGap,
        ).toBe(1);
    });

    it("still offers the merchant's slider from 6px", () => {
        const gap = siteStyleOptions().scalars.find((s) => s.key === "gridGap");
        expect(gap?.min).toBe(6);
        expect(gap).not.toHaveProperty("pickerMin");
    });
});

describe("siteStyleVariables with a palette and type scale", () => {
    it("emits the palette as HSL triples over the rows' colours", () => {
        const vars = siteStyleVariables(
            parseSiteStyle({ palette: GREEN, colours: { accent: "rose" } }),
        );
        expect(vars["--site-accent"]).toBe(hexToHslTriple("#1F3D2B"));
        expect(vars["--site-bg"]).toBe(hexToHslTriple("#F4F1E8"));
        expect(vars["--site-accent"]).toBe("144 32.61% 18.04%");
        for (const value of Object.values(vars)) {
            expect(value).not.toContain("#");
        }
    });

    it("emits the type scale's variables", () => {
        const vars = siteStyleVariables(parseSiteStyle({ type: TYPE }));
        expect(vars).toMatchObject({
            "--site-measure": "64ch",
            "--site-body-size": "16px",
            "--site-label-style": "eyebrowAccent",
        });
        expect(vars).not.toHaveProperty("--site-display-size");
    });

    it("leaves an untouched site's variables exactly as they were", () => {
        expect(siteStyleVariables(defaultSiteStyle())).toMatchInlineSnapshot(`
            {
              "--site-accent": "18 45% 45%",
              "--site-accent-fg": "0 0% 98%",
              "--site-bg": "0 0% 100%",
              "--site-body": "24 6.1% 45.1%",
              "--site-border": "24 1.1% 90.1%",
              "--site-cta-bg": "18 45% 45%",
              "--site-cta-fg": "0 0% 98%",
              "--site-fg": "24 10% 10%",
              "--site-footer-bg": "18 30% 30%",
              "--site-footer-fg": "0 0% 98%",
              "--site-grid-gap": "14px",
              "--site-heading-scale": "1",
              "--site-hero-bg": "0 0% 100%",
              "--site-hero-fg": "24 10% 10%",
              "--site-muted": "24 4.9% 55.9%",
              "--site-page-margin": "38px",
              "--site-radius": "2px",
              "--site-section-padding": "52px",
              "--site-surface": "0 0% 100%",
            }
        `);
        expect(defaultSiteStyle()).not.toHaveProperty("palette");
        expect(defaultSiteStyle()).not.toHaveProperty("type");
    });
});

describe("templateColourways", () => {
    it("offers each colourway by name with its whole look and three chips", () => {
        const offered = templateColourways(ceramics);
        expect(offered.map((c) => [c.id, c.name])).toEqual([
            ["green", "Green"],
            ["oxblood", "Oxblood"],
        ]);
        expect(offered[0].style.palette?.accent).toBe("#1F3D2B");
        expect(offered[0].style.scalars.gridGap).toBe(1);
        expect(offered[0].chips).toHaveLength(3);
    });

    it("leaves out a colourway that fails the rules rather than offering it", () => {
        const broken = {
            ...ceramics,
            styles: [
                ...(ceramics.styles ?? []),
                {
                    id: "faint",
                    name: "Faint",
                    style: { palette: { ...GREEN, fg: "#CCCCCC" } },
                },
            ],
        };
        expect(templateColourways(broken).map((c) => c.id)).toEqual([
            "green",
            "oxblood",
        ]);
    });

    it("is served with the options, with the colourway the site started in", () => {
        const options = siteStyleOptions(
            templateColourways(ceramics),
            "oxblood",
        );
        expect(options.colourways).toHaveLength(2);
        expect(options.startColourway).toBe("oxblood");
        expect(siteStyleOptions().colourways).toEqual([]);
        expect(siteStyleOptions().startColourway).toBeNull();
    });
});

describe("assertTemplateLookOffered", () => {
    const green = parseSiteStyle({ palette: GREEN, type: TYPE });

    it("lets a merchant choose one of the template's colourways", () => {
        expect(() =>
            assertTemplateLookOffered(parseSiteStyle({ palette: OXBLOOD }), {
                stored: null,
                template: ceramics,
            }),
        ).not.toThrow();
    });

    it("refuses a palette that is legible but not offered, on the field", () => {
        const own = parseSiteStyle({
            palette: { ...GREEN, accent: "#123456" },
        });
        let details: { field?: string } = {};
        try {
            assertTemplateLookOffered(own, {
                stored: green,
                template: ceramics,
            });
        } catch (error) {
            expect(error).toBeInstanceOf(BadRequestException);
            details = (
                (error as BadRequestException).getResponse() as {
                    details: { field: string };
                }
            ).details;
        }
        expect(details.field).toBe("palette");
    });

    it("refuses any palette on a site with no template", () => {
        expect(() =>
            assertTemplateLookOffered(green, { stored: null, template: null }),
        ).toThrow(BadRequestException);
    });

    it("refuses a type scale the template does not set", () => {
        const own = parseSiteStyle({ palette: GREEN, type: { measure: 52 } });
        expect(() =>
            assertTemplateLookOffered(own, {
                stored: null,
                template: ceramics,
            }),
        ).toThrow(/type scale/);
    });

    it("keeps the look a site already has, even if its template moved on", () => {
        expect(() =>
            assertTemplateLookOffered(green, { stored: green, template: null }),
        ).not.toThrow();
    });

    it("lets any style without a template look through, and clearing it", () => {
        expect(() =>
            assertTemplateLookOffered(defaultSiteStyle(), {
                stored: green,
                template: null,
            }),
        ).not.toThrow();
    });
});
