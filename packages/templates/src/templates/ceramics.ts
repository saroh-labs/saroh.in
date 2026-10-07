import type { TemplateContext, TemplateManifest } from "../manifest";
import { escapeHtml } from "./html";

/**
 * `ceramics` — the gallery's "Store" (industry templates plan, U5): a shop
 * for work made by hand in small runs. Designed as "Kiln", a ceramics
 * studio. One page, and no hero: the collection is the top of the page.
 *
 * - **The page's name**, for screen readers only (hero `none`,
 *   `titleVisible: false`): the header already shows it, so the page opens
 *   on the collection with no band and no photo above the fold.
 * - **Current collection** (`#collection`): the business's own products,
 *   read live, as plates — fixed cells with 1px hairlines between them, the
 *   first piece taking twice the room, the name and price on a band over
 *   the photo — with "{n} of {m} available" counted from the pieces shown.
 *   Names, prices and what is sold out come from the catalogue, never from
 *   here (KTD-4). Laid down only with Commerce on (DEC-057): without it the
 *   grid has nothing to show.
 * - **Material** (`#material`): three short notes the owner writes over
 *   (the clay, the glaze, the firing), then their photographs, captioned,
 *   shipped as a brief (KTD-5).
 * - **The studio**: a few words about where and how the work is made, and
 *   a short list of facts, beside a photo of the wheel on the left (a brief
 *   until the owner adds one).
 *
 * Section titles are the design's small green capitals (`eyebrowAccent`),
 * and the two anchored sections lead the header menu as in-page links.
 *
 * Left out, on purpose: the design's "Stocked at" list. Saroh holds no
 * stockists, so a list here could only be invented shop names on someone's
 * live site, and the design draws the section only when there are some.
 * The collection's note about pieces held for stockists goes with it; the
 * note the grid keeps says only what the grid itself shows.
 *
 * The words that describe the work are placeholders, and say so: Kiln's own
 * clay, town and maker would be false on any other business's site.
 */

export const CERAMICS_TEMPLATE_ID = "ceramics";

const COMMERCE = "COMMERCE";

/** A module list read defensively: absent or malformed is "not known". */
function modulesOf(ctx: TemplateContext): string[] {
    const { modules } = ctx as { modules?: unknown };
    return Array.isArray(modules)
        ? modules.filter((m): m is string => typeof m === "string")
        : [];
}

/** Whether the shop's products can be shown: Commerce is on. */
export function ceramicsSellsProducts(ctx: TemplateContext): boolean {
    return modulesOf(ctx).includes(COMMERCE);
}

/**
 * How many pieces the collection shows: the lead and four beside it, which
 * fills the design's grid (two rows) exactly.
 */
export const CERAMICS_COLLECTION_COUNT = 5;

/** What the material photographs should show (KTD-5). */
const MATERIAL_BRIEF =
    "Three square close-ups, each captioned: raw clay with grog specks and a thumbprint; glaze breaking over a thrown ridge; the kiln shelf through the spyhole";

/** The studio photograph (KTD-5), the design's own brief. */
const STUDIO_BRIEF =
    "The wheel mid-throw, clay-covered hands and forearms, shallow depth of field";

/** The design's exact colours: unbleached paper, ink and a deep green. */
const GREEN_PALETTE = {
    bg: "#F4F1E8",
    surface: "#EAE6DB",
    fg: "#1A1815",
    body: "#3B362E",
    muted: "#6E685E",
    border: "#DFDACD",
    accent: "#1F3D2B",
    accentFg: "#F4F1E8",
} as const;

/**
 * The Oxblood colourway's ash, cell and oxblood swatches; ink, body, quiet
 * text and the hairline held at Green's lightness and turned neutral.
 */
const OXBLOOD_PALETTE = {
    bg: "#F1F1F4",
    surface: "#DADADE",
    fg: "#18181B",
    body: "#37373D",
    muted: "#69696F",
    border: "#CBCBD0",
    accent: "#4F2927",
    accentFg: "#F1F1F4",
} as const;

/**
 * The design's type: a 1180px column, 16px body, and section titles as
 * small wide capitals in the accent.
 */
const CERAMICS_TYPE = {
    bodySize: 16,
    measure: 62,
    contentWidth: 1180,
    labelStyle: "eyebrowAccent",
} as const;

/** 1px gaps: the hairlines between the plates and the photographs. */
const CERAMICS_SCALARS = {
    pageMargin: 44,
    sectionPadding: 64,
    gridGap: 1,
    cornerRadius: 0,
    headingScale: 0.9,
} as const;

/**
 * The footer's line as it starts: where the design has the area and the
 * studio's open day, words that say what to write there.
 */
export const CERAMICS_FOOTER_LINE =
    "Your area and town — and when the studio is open";

export const ceramicsTemplate: TemplateManifest = {
    id: CERAMICS_TEMPLATE_ID,
    version: 1,
    name: "Store",
    description:
        "A shop for work made in small runs: the collection at the top of the page, the first piece given twice the room, then what the work is made of and where it is made.",
    slug: "store",
    kinds: ["shop", "creator"],
    shape: "store",
    sample: { name: "Kiln", host: "kiln.saroh.app" },
    uses: [COMMERCE],
    footer: { line: CERAMICS_FOOTER_LINE, layout: "left" },
    styles: [
        {
            // Unbleached paper, ink and a deep green; hairlines, not cards.
            id: "green",
            name: "Green",
            style: {
                colours: {
                    pageGround: "sand",
                    text: "ink",
                    accent: "moss",
                    heroBackground: "bone",
                    ctaBand: "graphite",
                    footer: "chalk",
                },
                scalars: CERAMICS_SCALARS,
                fontPair: "fraunces-inter-tight",
                palette: GREEN_PALETTE,
                type: CERAMICS_TYPE,
            },
        },
        {
            // The same page in ash and oxblood.
            id: "oxblood",
            name: "Oxblood",
            style: {
                colours: {
                    pageGround: "mist",
                    text: "ink",
                    accent: "clay",
                    heroBackground: "paper",
                    ctaBand: "clay",
                    footer: "chalk",
                },
                scalars: CERAMICS_SCALARS,
                fontPair: "fraunces-inter-tight",
                palette: OXBLOOD_PALETTE,
                type: CERAMICS_TYPE,
            },
        },
    ],
    pages: [
        {
            path: "/",
            title: "Home",
            isHome: true,
            sections: [
                {
                    // No hero: the page's one h1, for screen readers and
                    // search engines; the header already shows the name.
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "none",
                        heading: ctx.organizationName,
                        titleVisible: false,
                    }),
                },
                {
                    // The business's own products, read live (ADR-004).
                    type: "productGrid",
                    contractVersion: 1,
                    when: ceramicsSellsProducts,
                    content: {
                        variant: "plates",
                        anchor: "collection",
                        navLabel: "Collection",
                        title: "Current collection",
                        source: "newest",
                        count: CERAMICS_COLLECTION_COUNT,
                        showPrices: true,
                        showAvailability: true,
                        note: "Everything not marked sold out can be bought here.",
                    },
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: {
                        variant: "grid",
                        anchor: "material",
                        navLabel: "Material",
                        heading: "Material",
                        intro: "The clay, the glaze and the firing, and not one of them behaves the same way twice.",
                        // The design's one large line in the heading face.
                        introStyle: "display",
                        items: [
                            {
                                title: "The clay",
                                body: "A placeholder. Say where the clay comes from, what is in it and why the surface looks the way it does.",
                            },
                            {
                                title: "The glaze",
                                body: "A placeholder. Say which glazes you use and how they are mixed, and what that does to the colour.",
                            },
                            {
                                title: "The firing",
                                body: "A placeholder. Say how the work is fired, and how often a piece comes out of the kiln unusable.",
                            },
                        ],
                    },
                },
                {
                    // The material photographs: a brief until the owner adds
                    // them, and nothing on the live site until then (KTD-5).
                    type: "gallery",
                    contractVersion: 2,
                    content: {
                        variant: "grid",
                        images: [],
                        captionPlacement: "below",
                        imageBrief: MATERIAL_BRIEF,
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        format: "html",
                        imageBrief: STUDIO_BRIEF,
                        imageSide: "left",
                        // "The studio" as the page's other section titles
                        // (small green capitals), the facts as labels.
                        headingStyle: "label",
                        factsStyle: "labels",
                        value:
                            `<h2>The studio</h2>` +
                            `<p>This is a placeholder for where the work of ` +
                            `${escapeHtml(ctx.organizationName)} is made: the ` +
                            `room, the wheel and the hands. Say what that means ` +
                            `for the pieces, such as why no two in a set are ` +
                            `quite the same height.</p>` +
                            `<p>Say how the work is made and fired, in runs or ` +
                            `one at a time, and what happens when a glaze or a ` +
                            `batch is gone. Replace both paragraphs with your ` +
                            `own.</p>` +
                            `<dl>` +
                            `<dt>Studio</dt><dd>Your area and town — where you work</dd>` +
                            `<dt>Made by</dt><dd>Your name — or the names of everyone who makes</dd>` +
                            `<dt>Throwing since</dt><dd>Your first year — when you started</dd>` +
                            `</dl>`,
                    }),
                },
            ],
        },
    ],
};

/**
 * The design's words for the gallery's render of this template (KTD-6), in
 * place of the placeholders a live site starts with: the material notes,
 * the studio's paragraphs and facts, and the footer's line. Never laid
 * down on a merchant's site — only the gallery render applies it.
 */
export const CERAMICS_GALLERY_SAMPLE = {
    footer: "Koregaon Park, Pune · Open Saturdays, 9 to 1",
    material: [
        "Dug near Nashik and blended with 12% grog, which is why the surface never looks flat.",
        "Two celadons and one ash, mixed in 20-litre batches — so colour shifts between them.",
        "Reduction to cone 10. Roughly one piece in nine comes out of the kiln unusable.",
    ],
    studio: {
        paragraphs: [
            "Everything is thrown on one wheel in a room behind a house in Koregaon Park. There are no moulds and no second pair of hands, which is the reason a set of four tumblers are four slightly different heights.",
            "Pieces are made in runs of twenty or thirty and fired together, so a batch shares a colour the next one will not. When a glaze is gone it is genuinely gone.",
        ],
        /** The facts' values, in the template's order (its labels stay). */
        facts: ["Koregaon Park, Pune", "Anjali Deshpande", "2018"],
    },
} as const;
