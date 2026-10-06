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
 * 1. **Hero**, `fullBleed`, with the open-now line (`onToday`): the site's
 *    menu lies over the photo. The photo is a brief (KTD-5) until the owner
 *    adds one.
 * 2. **Today's bread**: the Product grid, read live from the storefront the
 *    site sells from (ADR-004, KTD-4). Names, prices and "Sold out" are the
 *    business's own; laid down only while Products (`COMMERCE`) is on.
 * 3. **The story**: the design's heading over placeholder paragraphs that
 *    say what to write, with the photo beside them as a brief. The design's
 *    own story is one bakery's history, so it is not put on anyone else's.
 * 4. **Come in the morning**: the Opening hours block, the business's week
 *    from Settings › Hours, closed days stated. With no hours saved it draws
 *    nothing.
 * 5. **From the bakery**: the Journal's archive, every published post as a
 *    dated list. With no posts it draws nothing.
 *
 * The footer is the site chrome's. Nothing here types a price, a product, an
 * hour or a post: a template's words are only what the owner will replace.
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
                scalars: {
                    pageMargin: 40,
                    sectionPadding: 76,
                    gridGap: 30,
                    cornerRadius: 0,
                },
                fontPair: "fraunces-inter-tight",
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
                scalars: {
                    pageMargin: 40,
                    sectionPadding: 76,
                    gridGap: 30,
                    cornerRadius: 0,
                },
                fontPair: "fraunces-inter-tight",
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
                    }),
                },
                {
                    type: "productGrid",
                    contractVersion: 1,
                    when: sellsProducts,
                    content: {
                        variant: "default",
                        title: "Today's bread",
                        source: "newest",
                        count: 5,
                    },
                },
                {
                    type: "richText",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => ({
                        format: "html",
                        value:
                            `<p><strong>The starter</strong></p>` +
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
                        title: "Come in the morning",
                    },
                },
                {
                    type: "journal",
                    contractVersion: 1,
                    content: {
                        variant: "archive",
                        title: "From the bakery",
                    },
                },
            ],
        },
    ],
};
