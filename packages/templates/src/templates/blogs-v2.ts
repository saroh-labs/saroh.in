import type { TemplateManifest, TemplateSection } from "../manifest";
import { blogsTemplateV1 } from "./blogs";

/**
 * `blogs@2`, redesigned to its TP board (site templates plan U9, KD10):
 * for NEW sites only; v1 sites keep v1.
 *
 * v1's Recent and Archive listed the same posts twice (the critique), and
 * its two colourways were a hue swap. The board:
 *
 * - **One list.** The newest piece opened on the page, then every other
 *   piece once, by year, each with its line ("Earlier writing",
 *   `#writing`), then About. Recent is gone.
 * - **Colourways that differ.** Red stays a paper page with no bands.
 *   Indigo sets the lead piece on a tinted band (the lead's `surface`
 *   band, which in Red is the page itself) and ends on an ink footer.
 *
 * The post page is the site's own post route (Older/Newer, U8): a
 * template lays down no post.
 */

/** v1's home section of a type (the nth of it); v1 is frozen. */
function v1Section(type: string, nth = 0): TemplateSection {
    const section = blogsTemplateV1.pages[0].sections
        .filter((s) => s.type === type)
        .at(nth);
    if (!section) throw new Error(`blogs@1 has no ${type} section`);
    return section;
}

const [red, indigoV1] = blogsTemplateV1.styles ?? [];

/**
 * Indigo, from the board: a cool paper ground, the lead on a pale indigo
 * band, ink-blue text and an ink footer. Every text pairing 4.5:1.
 */
const INDIGO_PALETTE = {
    bg: "#F7F8FB",
    surface: "#ECEEF8",
    fg: "#1B1E3F",
    body: "#33364A",
    muted: "#575B70",
    border: "#DCDFEC",
    accent: "#454BAC",
    accentFg: "#FFFFFF",
    footerBg: "#1B1E3F",
    footerFg: "#E4E6F4",
} as const;

export const blogsTemplate: TemplateManifest = {
    ...blogsTemplateV1,
    version: 2,
    description:
        "A journal for your writing on one page: your newest piece opened on the page, every other piece once, by year, and a few words about you.",
    styles: [
        red,
        {
            ...indigoV1,
            style: { ...indigoV1.style, palette: INDIGO_PALETTE },
        },
    ],
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                v1Section("hero"),
                {
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        variant: "lead",
                        anchor: "lead",
                        band: "surface",
                        showImages: false,
                    },
                },
                {
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        variant: "archive",
                        title: "Earlier writing",
                        anchor: "writing",
                        navLabel: "Writing",
                        afterLead: true,
                        groupByYear: true,
                        showTotal: true,
                        showExcerpts: true,
                        showImages: false,
                    },
                },
                v1Section("richText"),
            ],
        },
    ],
};
