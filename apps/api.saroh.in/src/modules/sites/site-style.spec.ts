import { BadRequestException } from "@nestjs/common";

import {
    STYLE_ROWS,
    STYLE_ROW_KEYS,
    STYLE_SCALARS,
    STYLE_SCALAR_KEYS,
    defaultSiteStyle,
    parseSiteStyle,
    readableOn,
    siteStyleOptions,
    siteStyleVariables,
} from "./site-style";

describe("the palette itself", () => {
    it("offers five options in every row, as the design specifies", () => {
        for (const row of STYLE_ROW_KEYS) {
            expect(STYLE_ROWS[row]).toHaveLength(5);
        }
    });

    it("has no duplicate keys within a row", () => {
        // A duplicate would make one option unselectable: the first match wins
        // when resolving, so the second would silently render as the first.
        for (const row of STYLE_ROW_KEYS) {
            const keys = STYLE_ROWS[row].map((s) => s.key);
            expect(new Set(keys).size).toBe(keys.length);
        }
    });

    it("states every swatch as three HSL components", () => {
        for (const row of STYLE_ROW_KEYS) {
            for (const swatch of STYLE_ROWS[row]) {
                expect(swatch.hsl).toMatch(
                    /^\d+(\.\d+)? \d+(\.\d+)?% \d+(\.\d+)?%$/,
                );
            }
        }
    });

    it("keeps every scalar's default inside its own range", () => {
        for (const key of STYLE_SCALAR_KEYS) {
            const { min, max, default: value } = STYLE_SCALARS[key];
            expect(value).toBeGreaterThanOrEqual(min);
            expect(value).toBeLessThanOrEqual(max);
        }
    });
});

describe("readableOn", () => {
    it("puts light text on a dark ground and dark text on a light one", () => {
        expect(readableOn("215 25% 12%")).toBe("0 0% 98%");
        expect(readableOn("0 0% 100%")).toBe("24 10% 10%");
    });

    it("gives every offered accent, CTA and footer colour a readable partner", () => {
        // #189 requires contrast to hold for every combination offered, and
        // these three rows are the ones that carry text on a filled area.
        for (const row of ["accent", "ctaBand", "footer"] as const) {
            for (const swatch of STYLE_ROWS[row]) {
                const fg = readableOn(swatch.hsl);
                const bgL = Number.parseFloat(swatch.hsl.split(" ")[2]);
                const fgL = Number.parseFloat(fg.split(" ")[2]);
                // A crude but honest proxy: the two must not sit close together
                // in lightness, which is what an unreadable pairing looks like.
                expect(Math.abs(bgL - fgL)).toBeGreaterThan(40);
            }
        }
    });

    it("falls back to a usable colour rather than throwing on a malformed swatch", () => {
        // Which of the two it picks for garbage is arbitrary and not worth
        // pinning; what matters is that a bad palette entry cannot crash a
        // render or produce something that is not a colour.
        expect(["0 0% 98%", "24 10% 10%"]).toContain(readableOn("nonsense"));
        expect(["0 0% 98%", "24 10% 10%"]).toContain(readableOn(""));
    });
});

describe("parseSiteStyle", () => {
    it("returns today's appearance when nothing is set", () => {
        // The defaults must be a visual no-op, so adding the column changed
        // nothing for the sites that already existed.
        expect(parseSiteStyle(null)).toEqual(defaultSiteStyle());
        expect(parseSiteStyle(undefined)).toEqual(defaultSiteStyle());
    });

    it("fills absent choices from the defaults", () => {
        const style = parseSiteStyle({ colours: { accent: "teal" } });
        expect(style.colours.accent).toBe("teal");
        expect(style.colours.text).toBe(defaultSiteStyle().colours.text);
        expect(style.scalars).toEqual(defaultSiteStyle().scalars);
    });

    it("REJECTS a colour that is not one of the offered options", () => {
        // Substituting silently would make the site look different from what
        // was asked for, with nothing on screen to explain it.
        expect(() =>
            parseSiteStyle({ colours: { accent: "#ff0000" } }),
        ).toThrow(BadRequestException);
        expect(() =>
            parseSiteStyle({ colours: { accent: "chartreuse" } }),
        ).toThrow(/not one of the Accent options/);
    });

    it("rejects a colour from the wrong row", () => {
        // "wheat" is a hero background, not an accent.
        expect(() => parseSiteStyle({ colours: { accent: "wheat" } })).toThrow(
            BadRequestException,
        );
    });

    it("CLAMPS a number outside its range rather than rejecting it", () => {
        // A slider a fraction out of range is a rounding artefact, not an
        // attack, and clamping keeps the site renderable.
        const style = parseSiteStyle({
            scalars: { pageMargin: 5000, cornerRadius: -12 },
        });
        expect(style.scalars.pageMargin).toBe(STYLE_SCALARS.pageMargin.max);
        expect(style.scalars.cornerRadius).toBe(STYLE_SCALARS.cornerRadius.min);
    });

    it("rejects a scalar that is not a finite number", () => {
        expect(() =>
            parseSiteStyle({ scalars: { pageMargin: "wide" } }),
        ).toThrow(BadRequestException);
        expect(() =>
            parseSiteStyle({ scalars: { pageMargin: Number.NaN } }),
        ).toThrow(BadRequestException);
    });

    it("rejects a style that is not an object", () => {
        expect(() => parseSiteStyle("dark")).toThrow(BadRequestException);
        expect(() => parseSiteStyle([])).toThrow(BadRequestException);
    });

    it("ignores unknown rows rather than failing the whole save", () => {
        // A field this version does not know about is a newer client or a
        // retired row; neither should stop a merchant saving their colours.
        const style = parseSiteStyle({
            colours: { accent: "teal", sidebar: "purple" },
        });
        expect(style.colours.accent).toBe("teal");
        expect(style.colours).not.toHaveProperty("sidebar");
    });
});

describe("siteStyleVariables", () => {
    it("resolves every choice into a --site-* custom property", () => {
        const vars = siteStyleVariables(defaultSiteStyle());
        expect(vars["--site-bg"]).toBe(STYLE_ROWS.pageGround[0].hsl);
        expect(vars["--site-fg"]).toBe(STYLE_ROWS.text[0].hsl);
        expect(vars["--site-accent"]).toBe(STYLE_ROWS.accent[0].hsl);
    });

    it("carries the scalars with their units", () => {
        const vars = siteStyleVariables(defaultSiteStyle());
        expect(vars["--site-section-padding"]).toBe("52px");
        expect(vars["--site-heading-scale"]).toBe("1");
    });

    it("never emits a Saroh token", () => {
        // PRODUCT.md: a merchant's site must not inherit Saroh's brand, and the
        // --site-* layer is separate by design.
        const keys = Object.keys(siteStyleVariables(defaultSiteStyle()));
        expect(keys.every((k) => k.startsWith("--site-"))).toBe(true);
    });

    it("pairs every filled area with its readable foreground", () => {
        const vars = siteStyleVariables(defaultSiteStyle());
        expect(vars["--site-accent-fg"]).toBe(
            readableOn(vars["--site-accent"]),
        );
        expect(vars["--site-cta-fg"]).toBe(readableOn(vars["--site-cta-bg"]));
    });
});

describe("siteStyleOptions", () => {
    it("serves every row and scalar the panel needs to draw itself", () => {
        const options = siteStyleOptions();
        expect(options.rows.map((r) => r.key)).toEqual(STYLE_ROW_KEYS);
        expect(options.scalars.map((s) => s.key)).toEqual(STYLE_SCALAR_KEYS);
        expect(options.rows[0].swatches[0]).toHaveProperty("hsl");
    });
});
