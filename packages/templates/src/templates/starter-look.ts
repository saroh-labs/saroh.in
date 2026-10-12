import type { TemplateStylePreset } from "../manifest";

/**
 * The starter's look (starter v4, DEC-141), shared with the two templates a
 * person starts from (`personal`, `portfolio`), so no kind is left in the
 * old unstyled page.
 *
 * It has to suit a salon, a shop, a clinic and a consultant alike, with no
 * photograph on the page. So it is quiet rather than characterful: paper
 * that is not white, ink that is not black, one accent used for links and
 * the one button, and type doing the work a picture would.
 *
 * Why each choice:
 *
 * - **Source Serif 4 over Inter** (`source-serif-inter`). A serif headline
 *   over a sans body gives the contrast between display and reading text
 *   that the old page (one system face at two sizes) lacked, and reads as
 *   a trade that takes care rather than a brand with a mood: at home over a
 *   price list, a product grid or a consultant's few lines. Both faces are
 *   already loaded for another pair, so the starter adds no font.
 * - **Display 56px, body 17px.** A ratio of about 3.3 to 1: the business's
 *   name is unmistakably the top of the page, and 17px keeps a services
 *   list and an address comfortable on a phone (the contract's floor is 15,
 *   the brief's 16).
 * - **A 64-character line in a 1120px column.** Inside the 45 to 75 a
 *   paragraph reads well at, and narrower than the 1280px most blocks take,
 *   so a page with three sections does not look stretched across a desk.
 * - **Section padding 80px, margin 32px, gap 20px.** Sections breathe: on a
 *   page with no photos, space is what separates one thing from the next.
 * - **Corners 8px.** Between the salon's soft 16 and a clinic's square
 *   edge; a card reads as a card without reading as a toy.
 * - **Heading scale 1.05.** Section titles a step up from the default, so
 *   the page has three clear sizes (name, section, text) and not two.
 * - **Section titles plain**, not small capitals: a starter's sections are
 *   few and each needs its heading read ("Services", "Find us").
 *
 * Every colourway keeps the same roles: the hero sits on the card colour
 * (so the top of the page is a band, not more paper), the closing band is
 * the accent, and the footer is the ink. Text pairings are checked by
 * `parsePalette` (4.5:1); the lowest in any of the three is the Clay accent
 * on its card, 5.16:1.
 */

const SCALARS = {
    pageMargin: 32,
    sectionPadding: 80,
    gridGap: 20,
    cornerRadius: 8,
    headingScale: 1.05,
} as const;

const TYPE = {
    displaySize: 56,
    bodySize: 17,
    measure: 64,
    contentWidth: 1120,
} as const;

const FONT_PAIR = "source-serif-inter" as const;

/** The colourways, the default first. Keys are recorded on the site. */
export const STARTER_STYLES: readonly TemplateStylePreset[] = [
    {
        /*
         * Stone, the default: warm paper and a deep evergreen. Green is the
         * one accent that claims no trade (red reads food or sale, blue
         * reads clinic or bank), so it is what a business that has chosen
         * nothing starts in.
         */
        id: "stone",
        name: "Stone",
        style: {
            colours: {
                pageGround: "bone",
                text: "ink",
                accent: "moss",
                heroBackground: "bone",
                ctaBand: "graphite",
                footer: "ink",
            },
            scalars: SCALARS,
            fontPair: FONT_PAIR,
            palette: {
                bg: "#F6F3EC",
                surface: "#ECE7DC",
                fg: "#1E1C18",
                body: "#38352F",
                muted: "#5F5A51",
                border: "#DDD6C8",
                accent: "#235847",
                accentFg: "#F9F7F1",
                heroBg: "#ECE7DC",
                heroFg: "#1E1C18",
                ctaBg: "#235847",
                ctaFg: "#F9F7F1",
                footerBg: "#1E1C18",
                footerFg: "#ECE7DC",
            },
            type: TYPE,
        },
    },
    {
        /*
         * Harbour: cool paper and a steady blue, for a practice, a clinic or
         * anyone whose customers want calm more than warmth. The same
         * lightness steps as Stone, the hue turned.
         */
        id: "harbour",
        name: "Harbour",
        style: {
            colours: {
                pageGround: "mist",
                text: "navy",
                accent: "steel",
                heroBackground: "paper",
                ctaBand: "navy",
                footer: "navy",
            },
            scalars: SCALARS,
            fontPair: FONT_PAIR,
            palette: {
                bg: "#F3F5F7",
                surface: "#E6EAEE",
                fg: "#18222C",
                body: "#2F3B47",
                muted: "#55616D",
                border: "#D5DCE3",
                accent: "#1E4F7A",
                accentFg: "#F7F9FB",
                heroBg: "#E6EAEE",
                heroFg: "#18222C",
                ctaBg: "#1E4F7A",
                ctaFg: "#F7F9FB",
                footerBg: "#18222C",
                footerFg: "#E6EAEE",
            },
            type: TYPE,
        },
    },
    {
        /*
         * Clay: the warmest of the three, a baked terracotta on blush
         * paper, for a salon, a kitchen or a maker. Darker than the Clay
         * swatch in Website › Style so it holds 4.5:1 as a link.
         */
        id: "clay",
        name: "Clay",
        style: {
            colours: {
                pageGround: "sand",
                text: "ink",
                accent: "clay",
                heroBackground: "bone",
                ctaBand: "clay",
                footer: "clay",
            },
            scalars: SCALARS,
            fontPair: FONT_PAIR,
            palette: {
                bg: "#F8F2EC",
                surface: "#EFE4DA",
                fg: "#2A1E1A",
                body: "#403029",
                muted: "#66544C",
                border: "#E3D4C7",
                accent: "#9A4526",
                accentFg: "#FCF8F4",
                heroBg: "#EFE4DA",
                heroFg: "#2A1E1A",
                ctaBg: "#9A4526",
                ctaFg: "#FCF8F4",
                footerBg: "#2A1E1A",
                footerFg: "#EFE4DA",
            },
            type: TYPE,
        },
    },
];
