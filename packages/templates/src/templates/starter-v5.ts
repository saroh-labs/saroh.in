import type {
    TemplateContext,
    TemplateKind,
    TemplateManifest,
    TemplateSection,
} from "../manifest";
import type { StarterAction } from "./starter-v4";
import {
    STARTER_IMAGE_BRIEFS,
    starterLine,
    starterPrimaryAction,
    starterTemplateV4,
} from "./starter-v4";

/**
 * `starter@5` — the site every new business starts from (plan
 * 2026-11-18-001 U10, board TP Starter): OVERDRIVE on day one. The
 * critique's finding was that the starter persuaded nobody: a name in a
 * band and no what or where. v5 keeps everything v4 lays down (DEC-141:
 * a section for what is switched on, the module pages, nothing untrue) and
 * changes the top and the one action:
 *
 * - **What and where, first.** The hero is the Split layout: the name, the
 *   business's own line (its services or what it sells, and its town),
 *   and in the image slot the Stamp, a monogram ring of the name and town
 *   drawn while there is no photo, never a grey box.
 * - **Where it is visited, the answer row**: Open now, Directions and
 *   Call under the button, read live, for a business with a place.
 * - **The trade's words on the one action** (DEC-216): a salon's button
 *   says "Book a chair", a gym's "Book a class". The hero and the closing
 *   band carry the same words, and the button goes where v4's went.
 *
 * Today's free times leave the hero (the Stamp takes that side); the
 * services list, with Book on every row, stays. For new sites only
 * (KD10): `starter@4` stays as shipped.
 */

/** A booking's words by trade; any other books "a time". */
const BOOK_WORDS: Partial<Record<TemplateKind, string>> = {
    salon: "Book a chair",
    gym: "Book a class",
    clinic: "Book an appointment",
    coach: "Book a session",
    creator: "Book a session",
};

/** Ordering's words by trade; any other browses the shop. */
const SHOP_WORDS: Partial<Record<TemplateKind, string>> = {
    food: "Order now",
};

/**
 * v4's one action ({@link starterPrimaryAction}) in the trade's words:
 * the same kind and the same place, only the label differs.
 */
export function starterActionV5(ctx: TemplateContext): StarterAction {
    const action = starterPrimaryAction(ctx);
    const trade = ctx.trade;
    const words =
        trade === undefined
            ? undefined
            : action.kind === "book"
              ? BOOK_WORDS[trade]
              : action.kind === "shop"
                ? SHOP_WORDS[trade]
                : undefined;
    return words ? { ...action, label: words } : action;
}

/** The hero: name, what and where, the action, the Stamp beside them. */
const HERO_V5: TemplateSection = {
    type: "hero",
    contractVersion: 1,
    content: (ctx: TemplateContext) => {
        const line = starterLine(ctx);
        const action = starterActionV5(ctx);
        return {
            variant: "split",
            heading: ctx.organizationName,
            ...(line ? { subheading: line } : {}),
            cta: { label: action.label, href: action.href, style: "primary" },
            imageBrief: STARTER_IMAGE_BRIEFS.hero,
            ...(ctx.hasPlace === true ? { answerRow: true } : {}),
        };
    },
};

/** v4's sections with the closing band in trade words. */
function v5Sections(sections: readonly TemplateSection[]): TemplateSection[] {
    return sections.map((section) => {
        if (section.type !== "cta") return section;
        return {
            ...section,
            content: (ctx: TemplateContext) => {
                const action = starterActionV5(ctx);
                return {
                    label: action.label,
                    href: action.href,
                    style: "primary",
                };
            },
        };
    });
}

/** `starter@5`: the one new sites start from. */
export const starterTemplate: TemplateManifest = {
    ...starterTemplateV4,
    version: 5,
    pages: starterTemplateV4.pages.map((page) => {
        const sections = v5Sections(page.sections);
        return page.isHome
            ? {
                  ...page,
                  sections: sections.map((s, i) => (i === 0 ? HERO_V5 : s)),
              }
            : { ...page, sections };
    }),
};
