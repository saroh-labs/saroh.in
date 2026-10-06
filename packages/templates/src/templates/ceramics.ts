import type { TemplateContext, TemplateManifest } from "../manifest";
import { escapeHtml } from "./html";

/**
 * `ceramics` — the gallery's "Store" (industry templates plan, U5): a shop
 * for work made by hand in small runs. Designed as "Kiln", a ceramics
 * studio. One page, and no hero: the collection is the top of the page.
 *
 * - **The page's name**, small (hero `none`): the name and the owner's own
 *   line, so the page still has its heading. No band, no photo above the
 *   fold.
 * - **Current collection**: the business's own products, read live, the
 *   first piece taking twice the room (Product grid `lead`). Names, prices
 *   and what is sold out come from the catalogue, never from here (KTD-4).
 *   Laid down only with Commerce on (DEC-057): without it the grid has
 *   nothing to show.
 * - **Material**: three short notes the owner writes over (the clay, the
 *   glaze, the firing), then their photographs, shipped as a brief (KTD-5).
 * - **The studio**: a few words about where and how the work is made, and
 *   a short list of facts, beside a photo of the wheel (a brief until the
 *   owner adds one).
 *
 * Left out, on purpose: the design's "Stocked at" list. Saroh holds no
 * stockists, so a list here could only be invented shop names on someone's
 * live site, and the design draws the section only when there are some.
 * The collection's note about pieces held for stockists goes with it.
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

/** What the owner has said about the work, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

/**
 * How many pieces the collection shows: the lead and four beside it, which
 * fills the design's grid (two rows) exactly.
 */
export const CERAMICS_COLLECTION_COUNT = 5;

/** What the material photographs should show (KTD-5). */
const MATERIAL_BRIEF =
    "Three close-ups, one each: raw clay with grog specks and a thumbprint; glaze breaking over a thrown ridge; the kiln shelf through the spyhole";

/** The studio photograph (KTD-5), the design's own brief. */
const STUDIO_BRIEF =
    "The wheel mid-throw, clay-covered hands and forearms, shallow depth of field";

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
                scalars: {
                    pageMargin: 44,
                    sectionPadding: 64,
                    gridGap: 6,
                    cornerRadius: 0,
                    headingScale: 0.9,
                },
                fontPair: "fraunces-inter-tight",
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
                scalars: {
                    pageMargin: 44,
                    sectionPadding: 64,
                    gridGap: 6,
                    cornerRadius: 0,
                    headingScale: 0.9,
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
                    // No hero: the page's heading, small, and straight on.
                    type: "hero",
                    contractVersion: 1,
                    content: (ctx: TemplateContext) => {
                        const own = ownWords(ctx);
                        return {
                            variant: "none",
                            heading: ctx.organizationName,
                            ...(own ? { subheading: own } : {}),
                        };
                    },
                },
                {
                    // The business's own products, read live (ADR-004).
                    type: "productGrid",
                    contractVersion: 1,
                    when: ceramicsSellsProducts,
                    content: {
                        variant: "lead",
                        title: "Current collection",
                        source: "newest",
                        count: CERAMICS_COLLECTION_COUNT,
                        showPrices: true,
                    },
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: {
                        variant: "grid",
                        heading: "Material",
                        intro: "The clay, the glaze and the firing, and not one of them behaves the same way twice.",
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
                            `<ul>` +
                            `<li><strong>Studio:</strong> where you work</li>` +
                            `<li><strong>Made by:</strong> your name</li>` +
                            `<li><strong>Throwing since:</strong> the year you started</li>` +
                            `</ul>`,
                    }),
                },
            ],
        },
    ],
};
