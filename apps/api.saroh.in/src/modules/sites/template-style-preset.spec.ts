import { listTemplates, presetSiteStyle } from "@saroh/templates";

import { parseSiteStyle, siteStyleVariables } from "./site-style";

/**
 * The renderer's template renders (industry templates U14) draw a colourway
 * with `presetSiteStyle`, which keeps what `parseSiteStyle` would keep and
 * never throws. For every colourway a merchant can start in, the two must
 * resolve to the same page, or the gallery shows a look the site would not
 * have.
 */
describe("presetSiteStyle", () => {
    const colourways = listTemplates().flatMap((t) =>
        (t.styles ?? []).map((s) => [`${t.id}/${s.id}`, s.style] as const),
    );

    it("has colourways to compare", () => {
        expect(colourways.length).toBeGreaterThan(0);
    });

    it.each(colourways)("%s resolves as a saved style does", (_, style) => {
        expect(siteStyleVariables(presetSiteStyle(style))).toEqual(
            siteStyleVariables(parseSiteStyle(style)),
        );
    });

    it("keeps the default where a saved style would be refused", () => {
        const style = presetSiteStyle({
            colours: { accent: "not-a-swatch" },
            scalars: { pageMargin: 999 },
            fontPair: "comic-sans",
        });
        expect(style.colours.accent).toBe("clay");
        expect(style.scalars.pageMargin).toBe(80);
        expect(style.fontPair).toBeUndefined();
    });
});
