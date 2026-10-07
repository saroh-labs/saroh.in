import type { TemplateContext, TemplateManifest } from "../manifest";
import { escapeHtml } from "./html";

/**
 * `bakery` — a bakery's one-page site (industry templates plan, U4; the
 * "Bakery" design, Store shape).
 *
 * The visitor is someone within walking distance deciding whether to go now,
 * so the page answers in that order: a photograph with whether it is open,
 * the bread on the shelf, why the bread is good, then when to come.
 *
 * Nothing is centred: every heading, line and link sits on the left edge.
 *
 * 1. **Hero**, `fullBleed`, with the open-now line (`onToday`): the site's
 *    menu lies over the photo. The photo is a brief (KTD-5) until the owner
 *    adds one. With Products on, "See today's bread" jumps to the bread.
 * 2. **Today's bread** (`#today`): the Product grid, read live from the
 *    storefront the site sells from (ADR-004, KTD-4), as bare 4:5 photos
 *    with "{n} of {m} available" beside the title, counted from
 *    the products shown. Names, prices and "Sold out" are the business's
 *    own; laid down only while Products (`COMMERCE`) is on.
 * 3. **The story**: the design's heading over placeholder paragraphs that
 *    say what to write, left-aligned, with the photo as a brief. The
 *    design's own story is one bakery's history, so it is not put on anyone
 *    else's.
 * 4. **Come in the morning** (`#visit`), on the dark band: the business's
 *    week from Settings › Hours, days with the same hours as one line,
 *    closed days stated, and the address under it. With no hours saved it
 *    draws nothing.
 * 5. **From the bakery** (`#journal`): the Journal's archive, the newest
 *    three as a dated list and "All {n} entries". With no posts it draws
 *    nothing.
 *
 * The three anchored sections lead the header menu as in-page links. The
 * footer starts with a line in the design's place that tells the owner what
 * to put there. Nothing here types a price, a product, an hour or a post: a
 * template's words are only what the owner will replace.
 */

export const BAKERY_TEMPLATE_ID = "bakery";

/** The photographs the design asks for, as briefs (KTD-5). */
export const BAKERY_IMAGE_BRIEFS = {
    hero: "Loaves cooling on a wire rack, shot from above in morning light — warm, floury, no people",
    story: "Hands folding dough on a flour-dusted bench — close, warm, slightly messy",
} as const;

/** What the owner has said about the business, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

/** Whether the business sells from its site: Products is on (DEC-057). */
function sellsProducts(ctx: TemplateContext): boolean {
    return (ctx.modules ?? []).includes("COMMERCE");
}

/**
 * "Open now"'s green dot. Over the hero's photo, and in the dark Visit
 * band, the design's own #9BD17B (9:1 on the ink); on the page, where that
 * pale green reads at 1.7:1, a deeper leaf from the same family (3.9:1, a
 * graphic's 3:1 met).
 */
const BAKERY_STATUS = {
    status: "#4E8A36",
    statusInverse: "#9BD17B",
} as const;

/** The design's ground, ink and text tones, with brick as the link colour. */
const CRUST_PALETTE = {
    bg: "#FBF7EF",
    surface: "#F3EBDD",
    fg: "#2A1F14",
    body: "#57452F",
    muted: "#7A6449",
    border: "#E6DAC6",
    // The design's crust (#C96A3A) reads at 3.5:1 on flour, under the 4.5:1
    // a link needs; brick is its darker sibling in the same swatch set.
    accent: "#8A3324",
    accentFg: "#FBF7EF",
    ...BAKERY_STATUS,
} as const;

/**
 * The same page in porcelain and damson: the ink, body and quiet tones held
 * at Crust's lightness and turned cool.
 */
const PORCELAIN_PALETTE = {
    bg: "#F5F8FB",
    surface: "#E3E7EE",
    fg: "#1B2230",
    body: "#3D4757",
    muted: "#5C6676",
    border: "#DCE1EA",
    accent: "#732B58",
    accentFg: "#F5F8FB",
    ...BAKERY_STATUS,
} as const;

/** The design's type: a 68px display line and a 1240px column. */
const BAKERY_TYPE = {
    displaySize: 68,
    bodySize: 16.5,
    measure: 58,
    contentWidth: 1240,
} as const;

const BAKERY_SCALARS = {
    pageMargin: 40,
    sectionPadding: 76,
    gridGap: 30,
    cornerRadius: 0,
} as const;

/**
 * The footer's line as it starts: where the design has the street and the
 * closed day, words that say what to write there.
 */
export const BAKERY_FOOTER_LINE =
    "Your street and area — and the day you close";

export const bakeryTemplate: TemplateManifest = {
    id: BAKERY_TEMPLATE_ID,
    version: 1,
    name: "Bakery",
    description:
        "A one-page site for a bakery: whether you're open, today's bread from your products, your story, your hours and your journal.",
    slug: "bakery",
    kinds: ["food"],
    shape: "store",
    sample: { name: "Rye & Co.", host: "ryeandco.saroh.app" },
    uses: ["COMMERCE"],
    footer: { line: BAKERY_FOOTER_LINE, layout: "left" },
    styles: [
        {
            // Flour, crust and brick.
            id: "crust",
            name: "Crust",
            style: {
                colours: {
                    pageGround: "bone",
                    text: "ink",
                    accent: "clay",
                    heroBackground: "wheat",
                    ctaBand: "clay",
                    footer: "chalk",
                },
                scalars: BAKERY_SCALARS,
                fontPair: "fraunces-inter-tight",
                palette: CRUST_PALETTE,
                type: BAKERY_TYPE,
            },
        },
        {
            // Porcelain and damson.
            id: "porcelain",
            name: "Porcelain",
            style: {
                colours: {
                    pageGround: "mist",
                    text: "ink",
                    accent: "clay",
                    heroBackground: "paper",
                    ctaBand: "plum",
                    footer: "chalk",
                },
                scalars: BAKERY_SCALARS,
                fontPair: "fraunces-inter-tight",
                palette: PORCELAIN_PALETTE,
                type: BAKERY_TYPE,
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
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "fullBleed",
                        heading: "Bread worth the walk",
                        subheading:
                            ownWords(ctx) ??
                            `What's on the shelf at ${ctx.organizationName} today, and when to come in.`,
                        imageBrief: BAKERY_IMAGE_BRIEFS.hero,
                        onToday: true,
                        // Only where there is bread to jump to.
                        ...(sellsProducts(ctx)
                            ? {
                                  cta: {
                                      label: "See today's bread",
                                      href: "/#today",
                                      style: "link",
                                  },
                              }
                            : {}),
                    }),
                },
                {
                    type: "productGrid",
                    contractVersion: 1,
                    when: sellsProducts,
                    content: {
                        variant: "default",
                        anchor: "today",
                        navLabel: "Today's bread",
                        title: "Today's bread",
                        source: "newest",
                        count: 5,
                        cardStyle: "bare",
                        // The design's five breads in one row at the desk.
                        columns: 5,
                        showAvailability: true,
                        note: "Baked this morning. Anything marked sold out has gone for today.",
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        variant: "left",
                        format: "html",
                        // The design's small eyebrow over the story.
                        label: "The starter",
                        value:
                            `<h2>Everything here begins in a clip-top jar</h2>` +
                            `<p>This is a placeholder for the story behind ` +
                            `${escapeHtml(ctx.organizationName)}'s bread: ` +
                            `where the starter or the recipe came from, and ` +
                            `who has kept it going.</p>` +
                            `<p>Then say what makes it taste of something: ` +
                            `the flour, the time the dough is given, when it ` +
                            `is mixed. Two short paragraphs are plenty. ` +
                            `Replace these with your own.</p>`,
                        imageBrief: BAKERY_IMAGE_BRIEFS.story,
                        imageSide: "right",
                    }),
                },
                {
                    type: "hours",
                    contractVersion: 1,
                    content: {
                        variant: "default",
                        anchor: "visit",
                        navLabel: "Visit",
                        band: "inverse",
                        title: "Come in the morning",
                        groupDays: true,
                        showAddress: true,
                    },
                },
                {
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        variant: "archive",
                        anchor: "journal",
                        navLabel: "Journal",
                        title: "From the bakery",
                        archiveLimit: 3,
                        shortDates: true,
                    },
                },
            ],
        },
    ],
};

/**
 * The design's words for the gallery's render of this template (KTD-6), in
 * place of the placeholders a live site starts with: the starter's story
 * and the footer's line. Never laid down on a merchant's site —
 * `instantiateTemplate` does not read it; only the gallery render applies it.
 */
export const BAKERY_GALLERY_SAMPLE = {
    footer: "14 Hill Road, Bandra West · Closed Mondays",
    story: {
        paragraphs: [
            "The starter was made in a rented kitchen in 2015 from flour, water and the skin of a black grape. It has been fed almost every evening since, and it is the only ingredient in this bakery we cannot buy again.",
            "That is most of what makes the bread taste of something. The rest is time — the dough is mixed at four in the afternoon, folded until seven, and left cold overnight so the flour has somewhere to go.",
        ],
        sign: "— Priya, who mixes",
    },
} as const;
