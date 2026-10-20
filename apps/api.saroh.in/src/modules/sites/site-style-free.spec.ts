// DEC-177, DB-free: which parts of a style save are paid for a site, from
// the catalogue's free lists and what every site always has. The templates
// are the real ones (the salon's two colourways, Kesar and Mauve, both in
// Fraunces and Inter Tight); the catalogue lists are made up here.
import { getTemplate } from "@saroh/templates";

import type { SiteStyle } from "./site-style";
import { defaultSiteStyle } from "./site-style";
import {
    colourwayKey,
    paidStyleParts,
    siteFreeStyles,
} from "./site-style-free";
import { templateColourways } from "./site-style-offer";

const salon = getTemplate("salon", 1)!;
const [kesar, mauve] = templateColourways(salon);
const none = { looks: [], fontPairs: [], colourways: [] };

/** The salon site as made: Kesar, the template's pair, Classic. */
function made(): SiteStyle {
    return {
        ...kesar.style,
        fontPair: "fraunces-inter-tight",
    };
}

function paid(
    next: SiteStyle,
    {
        stored = made(),
        lists = none,
        liveLook,
    }: {
        stored?: SiteStyle;
        lists?: typeof none & Partial<Record<string, string[]>>;
        liveLook?: "folio" | "quiet" | "live";
    } = {},
) {
    return paidStyleParts(next, {
        stored,
        liveLook,
        template: salon,
        free: siteFreeStyles(lists, salon, "kesar"),
    });
}

describe("siteFreeStyles", () => {
    it("frees the system font, the template's pairs and the colourway it was made in", () => {
        expect(siteFreeStyles(none, salon, "kesar")).toEqual({
            looks: [],
            fontPairs: ["system", "fraunces-inter-tight"],
            colourways: ["kesar"],
        });
        // Made in none it knows: the template's first, as Reset reads it.
        expect(siteFreeStyles(none, salon, null).colourways).toEqual(["kesar"]);
    });

    it("adds the catalogue's, a colourway only on its own template", () => {
        const free = siteFreeStyles(
            {
                looks: ["quiet", "folio", "unknown"],
                fontPairs: ["archivo"],
                colourways: ["salon:mauve", "clinic:tide"],
            },
            salon,
            "kesar",
        );
        expect(free.looks).toEqual(["folio", "quiet"]);
        expect(free.fontPairs).toContain("archivo");
        expect(free.colourways).toEqual(["kesar", "mauve"]);
    });

    it("gives a site with no template the system font alone", () => {
        expect(siteFreeStyles(none, undefined, null)).toEqual({
            looks: [],
            fontPairs: ["system"],
            colourways: [],
        });
    });
});

describe("paidStyleParts", () => {
    it("lets swatches and sliders through: they're the merchant's own", () => {
        const next = made();
        next.colours = { ...next.colours, accent: "teal" };
        next.scalars = { ...next.scalars, cornerRadius: 12 };
        expect(paid(next)).toEqual([]);
    });

    it("finds a paid look, typeface and colourway", () => {
        const next: SiteStyle = {
            ...mauve.style,
            fontPair: "archivo",
            look: "folio",
        };
        expect(paid(next)).toEqual([
            { field: "look", id: "folio" },
            { field: "fontPair", id: "archivo" },
            { field: "palette", id: colourwayKey("salon", "mauve") },
        ]);
    });

    it("frees what the catalogue lists", () => {
        const next: SiteStyle = {
            ...mauve.style,
            fontPair: "archivo",
            look: "folio",
        };
        expect(
            paid(next, {
                lists: {
                    looks: ["folio"],
                    fontPairs: ["archivo"],
                    colourways: ["salon:mauve"],
                },
            }),
        ).toEqual([]);
    });

    it("always allows the system font, its own pair and Classic", () => {
        const { fontPair: _pair, ...system } = made();
        expect(paid(system)).toEqual([]);
        expect(
            paid(made(), { stored: { ...made(), fontPair: "archivo" } }),
        ).toEqual([]);
        const { look: _look, ...classic } = { ...made(), look: "live" };
        expect(
            paid(classic as SiteStyle, {
                stored: { ...made(), look: "live" },
            }),
        ).toEqual([]);
    });

    it("keeps what the site already has, and the live site's look", () => {
        const has: SiteStyle = {
            ...mauve.style,
            fontPair: "archivo",
            look: "quiet",
        };
        expect(paid(has, { stored: has })).toEqual([]);
        expect(paid({ ...made(), look: "live" }, { liveLook: "live" })).toEqual(
            [],
        );
    });

    it("reads a default style with no palette as no colourway", () => {
        expect(paid(defaultSiteStyle(), { stored: undefined })).toEqual([]);
    });
});
