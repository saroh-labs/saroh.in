import type {
    TemplateContext,
    TemplateManifest,
    TemplateSection,
    TemplateStylePreset,
} from "../manifest";
import { bakeryTemplateV1 } from "./bakery";

/**
 * `bakery@2` — the bakery redesigned to its TB board (site templates plan
 * U9, KD10): for NEW sites only. Sites made from `bakery@1` keep it; the
 * template upgrade is never run for them, and a module switch plans against
 * the site's stored version.
 *
 * The visitor's first question is "can I get bread, and when?", so the
 * answer leads the first phone screen:
 *
 * 1. **Hero, Answer panel Pickup** (lighter than v1's full-bleed photo):
 *    the heading, the business's own line, the owner's order-by and
 *    where-to-collect words beside it, and the answer row (Open now,
 *    Directions, Call), read live. With Products on, ONE main action,
 *    "Order for pickup", to `/order`.
 * 2. **Today's bread**: v1's grid, now with a − / + stepper that adds to
 *    the bag where it stands (`addInPlace`).
 * 3. **Come in the morning**: the week and the address on the dark band,
 *    moved above the story (the board's order).
 * 4. **The story** and 5. **From the bakery**, as v1.
 *
 * `/order` (with Products on): the bread as a list with steppers, then the
 * pickup facts on a band. The pickup words are the owner's to type until
 * the business's settings carry a cut-off (plan Assumptions); the template
 * writes ones true of any bakery that takes pickup orders.
 *
 * Colourways: Crust, as v1, and Cardamom (cardamom-pod green on toasted
 * milk), which replaces the cold Porcelain for new sites. A v1 site in
 * Porcelain keeps it: its colourways are read from its stored version.
 */

/** Whether the business sells from its site: Products is on (DEC-057). */
function sellsProducts(ctx: TemplateContext): boolean {
    return (ctx.modules ?? []).includes("COMMERCE");
}

/** What the owner has said about the business, if anything. */
function ownWords(ctx: TemplateContext): string | undefined {
    return ctx.tagline ?? ctx.description;
}

/** v1's section of a type on its home page; v1 is frozen, so this is too. */
function v1Section(type: string): TemplateSection {
    const section = bakeryTemplateV1.pages[0].sections.find(
        (s) => s.type === type,
    );
    if (!section) throw new Error(`bakery@1 has no ${type} section`);
    return section;
}

/** v1's literal content for a section, with changes laid over it. */
function v1Content(
    type: string,
    changes: Record<string, unknown>,
): Record<string, unknown> {
    const content = v1Section(type).content;
    return { ...(content as Record<string, unknown>), ...changes };
}

const [crust] = bakeryTemplateV1.styles ?? [];

/**
 * Cardamom: the pod's green on a toasted-milk ground (board TB, the
 * Cardamom phone). Every text pairing 4.5:1; the open-now dot the green
 * on the page and a pale pod over the dark band.
 */
const CARDAMOM_PALETTE = {
    bg: "#F7F2E4",
    surface: "#ECE5CF",
    fg: "#1F2416",
    body: "#454C35",
    muted: "#5C6249",
    border: "#DDD5BB",
    accent: "#3E5A28",
    accentFg: "#F7F2E4",
    status: "#3E5A28",
    statusInverse: "#C9DE9A",
} as const;

const cardamom: TemplateStylePreset = {
    id: "cardamom",
    name: "Cardamom",
    style: {
        ...crust.style,
        colours: {
            pageGround: "sand",
            text: "ink",
            accent: "moss",
            heroBackground: "wheat",
            ctaBand: "graphite",
            footer: "chalk",
        },
        palette: CARDAMOM_PALETTE,
    },
};

/** The order page's address: a page of the site, not the module's /shop. */
export const BAKERY_ORDER_PATH = "/order";

/**
 * The pickup words a new site starts with: true of any bakery that takes
 * pickup orders, for the owner to make exact ("Order by 8pm").
 */
export const BAKERY_PICKUP_WORDS = {
    orderBy: "Order the day before, collect in the morning",
    where: "Collect from the counter. Your name is enough.",
} as const;

export const bakeryTemplate: TemplateManifest = {
    ...bakeryTemplateV1,
    version: 2,
    description:
        "A bakery's site that answers first: when to order and where to collect, whether you're open, today's bread with an order page, your hours, your story and your journal.",
    styles: [crust, cardamom],
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
                        variant: "answer",
                        heading: "Bread worth the walk",
                        subheading:
                            ownWords(ctx) ??
                            `What's on the shelf at ${ctx.organizationName} today, and when to come in.`,
                        panel: { kind: "pickup", ...BAKERY_PICKUP_WORDS },
                        answerRow: true,
                        // One main action, and only where there is bread
                        // to order.
                        ...(sellsProducts(ctx)
                            ? {
                                  cta: {
                                      label: "Order for pickup",
                                      href: BAKERY_ORDER_PATH,
                                      style: "primary",
                                      phoneLabel: "Order",
                                  },
                              }
                            : {}),
                    }),
                },
                {
                    type: "productGrid",
                    contractVersion: 1,
                    when: sellsProducts,
                    content: v1Content("productGrid", {
                        addInPlace: true,
                        note: "Baked this morning. Sold out means gone for today.",
                    }),
                },
                v1Section("hours"),
                v1Section("richText"),
                v1Section("journal"),
            ],
        },
        {
            path: BAKERY_ORDER_PATH,
            title: "Order",
            when: sellsProducts,
            sections: [
                {
                    type: "hero",
                    contractVersion: 1,
                    content: {
                        variant: "none",
                        heading: "Order for pickup",
                        subheading:
                            "Choose your bread and how many, and collect it from the counter.",
                    },
                },
                {
                    type: "productGrid",
                    contractVersion: 1,
                    content: {
                        variant: "default",
                        title: "Choose your bread",
                        source: "newest",
                        count: 12,
                        layout: "list",
                        showPrices: true,
                        showDescriptions: true,
                        showAvailability: true,
                        addInPlace: true,
                    },
                },
                {
                    type: "features",
                    contractVersion: 1,
                    content: {
                        variant: "band",
                        heading: "How pickup works",
                        items: [
                            {
                                title: "Order the day before",
                                body: "It is baked for you that morning.",
                            },
                            {
                                title: "Collect from the counter",
                                body: "Give your name. There is nothing to print.",
                            },
                            {
                                title: "Sold out today?",
                                body: "Order it for the next bake.",
                            },
                        ],
                    },
                },
            ],
        },
    ],
};
