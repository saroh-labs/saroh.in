import type {
    TemplateContext,
    TemplateManifest,
    TemplateSection,
} from "../manifest";
import { ceramicsSellsProducts, ceramicsTemplateV1 } from "./ceramics";

/**
 * `ceramics@2`, the gallery's "Store", redesigned to its TB board (site
 * templates plan U9, KD10): for NEW sites only; v1 sites keep v1.
 *
 * v1 opened on a label with no maker, and an orphaned material photo with
 * its caption cut (the critique). The board answers "who made this, and
 * will it reach me in one piece?" first:
 *
 * 1. **Hero, split, maker first**: what the shop makes, the Byline (who
 *    makes it), and with Products on ONE main action, "Shop the
 *    collection". The photo is a brief; until there is one the Stamp holds
 *    the slot.
 * 2. **This batch**: v1's plates, read live.
 * 3. **Material**: v1's three notes. The material photographs are left out
 *    (the orphaned third image).
 * 4. **Sent to survive the courier** (`#delivery`): packing and delivery
 *    time, breakage, returns and care, on a band. Typed words until the
 *    business's settings carry them (plan Assumptions), so they are
 *    placeholders that say what to write: a breakage promise is the
 *    owner's to make.
 * 5. **The studio** (`#studio`): v1's words and facts.
 */

/** v1's home section of a type (the nth of it); v1 is frozen. */
function v1Section(type: string, nth = 0): TemplateSection {
    const section = ceramicsTemplateV1.pages[0].sections
        .filter((s) => s.type === type)
        .at(nth);
    if (!section) throw new Error(`ceramics@1 has no ${type} section`);
    return section;
}

/** The maker's photograph, mid-throw (KTD-5). */
export const CERAMICS_HERO_BRIEF =
    "A piece mid-throw on the wheel, the week this batch was made";

export const ceramicsTemplate: TemplateManifest = {
    ...ceramicsTemplateV1,
    version: 2,
    description:
        "A shop for work made in small runs: who makes it first, the current batch, what it is made of, how it is sent, and where it is made.",
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
                        variant: "split",
                        heading:
                            ctx.tagline ??
                            ctx.description ??
                            "Made by hand, in small runs",
                        subheading:
                            "A placeholder. Say what you make and what it is made of, and what happens when a batch is gone.",
                        byline: {
                            name: "Your name",
                            role: "Who makes the work, and since when",
                        },
                        imageBrief: CERAMICS_HERO_BRIEF,
                        ...(ceramicsSellsProducts(ctx)
                            ? {
                                  cta: {
                                      label: "Shop the collection",
                                      href: "/#collection",
                                      style: "primary",
                                      phoneLabel: "Shop",
                                  },
                              }
                            : {}),
                        secondaryCta: {
                            label: "About the studio",
                            href: "/#studio",
                        },
                    }),
                },
                {
                    ...v1Section("productGrid"),
                    content: {
                        ...(v1Section("productGrid").content as object),
                        title: "This batch",
                    },
                },
                v1Section("features"),
                {
                    type: "features",
                    contractVersion: 1,
                    content: {
                        variant: "band",
                        anchor: "delivery",
                        navLabel: "Delivery",
                        heading: "Sent to survive the courier",
                        intro: "What happens after an order, from the packing to the doorstep.",
                        items: [
                            {
                                title: "Packed for the courier",
                                body: "A placeholder. Say how each piece is packed and how long delivery takes.",
                            },
                            {
                                title: "If it arrives broken",
                                body: "A placeholder. Say what a customer sends you, and by when, and what you do then.",
                            },
                            {
                                title: "Returns",
                                body: "A placeholder. Say whether unused pieces can come back, and within how many days.",
                            },
                            {
                                title: "Care",
                                body: "A placeholder. Say what the pieces are safe for: the dishwasher, the microwave, the oven.",
                            },
                        ],
                    },
                },
                {
                    ...v1Section("richText"),
                    content: (ctx: TemplateContext) => {
                        const v1 = v1Section("richText").content as (
                            c: TemplateContext,
                        ) => Record<string, unknown>;
                        return {
                            ...v1(ctx),
                            anchor: "studio",
                            navLabel: "Studio",
                        };
                    },
                },
            ],
        },
    ],
};
