import type { LookId, SitePalette } from "@saroh/block-contract";

import type { InstantiatedTemplate } from "./instantiate";
import type { TemplateManifest } from "./manifest";
import { getTemplate } from "./registry";
import { BAKERY_TEMPLATE_ID } from "./templates/bakery";
import {
    PRANA_LOOK_SECTIONS,
    PRANA_LOOK_WORDS,
    PRANA_TEMPLATE_ID,
    pranaShowcase,
} from "./templates/prana";

/** A choice in the editor's Look row: one of the looks, or Classic. */
export type ShowcaseLook = LookId | "classic";

/**
 * The template each look's Preview shows (DEC-182): the business its
 * boards draw, Prana Yoga (VA01, VD01, VB01), for Quiet, Folio and Live
 * (amended 22 Oct: the showcase is the board's page), and the Bakery for
 * Classic. "Use this look with its starter content" copies the same pages
 * into the draft. Every template named here has gallery samples
 * (`look-showcase.test.ts`).
 */
export const LOOK_SHOWCASE_TEMPLATE: Readonly<Record<ShowcaseLook, string>> = {
    quiet: PRANA_TEMPLATE_ID,
    live: PRANA_TEMPLATE_ID,
    folio: PRANA_TEMPLATE_ID,
    classic: BAKERY_TEMPLATE_ID,
};

/**
 * Templates drawn only as a look's showcase: never in the registry, so no
 * merchant picks one and the gallery never lists it.
 */
export const SHOWCASE_ONLY_TEMPLATES: Readonly<
    Partial<Record<string, TemplateManifest>>
> = {
    [PRANA_TEMPLATE_ID]: pranaShowcase,
};

/**
 * The colours each look's Preview draws in (DEC-172 amendment, 22 Oct): its
 * board's own, so a look is seen as designed rather than in its showcase
 * template's colourway (the Classic sites made from it keep theirs). Preview
 * only: a site that takes a look keeps its own colours (KD3). Quiet is
 * board VD's `.site`, Folio VA's `.site`, Live VB's `th-pulse`.
 */
export const LOOK_SHOWCASE_PALETTE: Readonly<Record<LookId, SitePalette>> = {
    quiet: {
        bg: "#F7F5F1",
        surface: "#FFFFFF",
        fg: "#23221F",
        body: "#45423D",
        muted: "#69655E",
        border: "#E2DDD5",
        accent: "#4D6455",
        accentFg: "#FFFFFF",
        heroBg: "#F7F5F1",
        heroFg: "#23221F",
        ctaBg: "#4D6455",
        ctaFg: "#FFFFFF",
        footerBg: "#EFECE6",
        footerFg: "#23221F",
    },
    folio: {
        bg: "#E9ECE6",
        surface: "#F4F5F1",
        fg: "#1E2420",
        body: "#323A34",
        muted: "#5A625B",
        border: "#C3C9C0",
        accent: "#3F5A45",
        accentFg: "#F4F5F1",
        heroBg: "#E9ECE6",
        heroFg: "#1E2420",
        ctaBg: "#3F5A45",
        ctaFg: "#F4F5F1",
        footerBg: "#1E2420",
        footerFg: "#E3E7E0",
    },
    live: {
        bg: "#EDEEEA",
        surface: "#FFFFFF",
        fg: "#121410",
        body: "#121410",
        muted: "#55584F",
        border: "#DEE0D8",
        // Lime is only ever a fill with ink on it; as text the board uses
        // its "signature as text on light" (`--site-accent-ink`).
        accent: "#C6F432",
        accentFg: "#121410",
        accentText: "#4C6300",
        // The board's live green (#2BB673), darkened to a dot's 3:1 on the
        // page; lime over the ink.
        status: "#279961",
        statusInverse: "#C6F432",
        heroBg: "#EDEEEA",
        heroFg: "#121410",
        // The board's ink cards and footer.
        ctaBg: "#121410",
        ctaFg: "#FFFFFF",
        footerBg: "#121410",
        footerFg: "#FFFFFF",
    },
};

/**
 * A showcase template's pages as its look's Preview draws them, and as
 * "Use this look with its starter content" copies them (DEC-182): Prana's
 * home keeps the look's own board's sections, in its words. Any other
 * template's pages are given back as they are.
 */
export function withLookShowcase(
    look: LookId | null | undefined,
    built: InstantiatedTemplate,
): InstantiatedTemplate {
    if (!look || !built.pages.some((p) => p.isHome)) return built;
    const keep = PRANA_LOOK_SECTIONS[look];
    const words = PRANA_LOOK_WORDS[look];
    return {
        pages: built.pages.map((page) =>
            page.isHome
                ? {
                      ...page,
                      sections: page.sections
                          .filter((section) => keep.includes(section.type))
                          .map((section) =>
                              words[section.type]
                                  ? {
                                        ...section,
                                        content: {
                                            ...(section.content as Record<
                                                string,
                                                unknown
                                            >),
                                            ...words[section.type],
                                        },
                                    }
                                  : section,
                          ),
                  }
                : page,
        ),
    };
}

/** The showcase template for a look (null is Classic), latest version. */
export function lookShowcaseTemplate(
    look: LookId | null | undefined,
): TemplateManifest {
    const id = LOOK_SHOWCASE_TEMPLATE[look ?? "classic"];
    const template = SHOWCASE_ONLY_TEMPLATES[id] ?? getTemplate(id);
    // The mapping names registered templates only (its test holds it).
    if (!template) throw new Error(`No showcase template "${id}"`);
    return template;
}

/** A page of the site as the copy plan reads it. */
export interface StarterCopySitePage {
    id: string;
    path: string;
    title: string;
    isHome: boolean;
    /** FREE, or the module page it is. Absent means FREE. */
    kind?: string;
}

/** A template page as the copy plan reads it. */
export interface StarterCopyTemplatePage {
    path: string;
    title: string;
    isHome: boolean;
}

/** What copying a template's pages into a draft does, page by page. */
export interface StarterCopyPlan {
    /** The site's pages whose draft is replaced, with the template's page. */
    replace: { pageId: string; title: string; from: string }[];
    /** The template's pages the site lacks: made as new draft pages. */
    create: { path: string; title: string }[];
    /**
     * The template's pages left out: their address is one of the site's
     * module pages (a Book or Shop page is the business's own).
     */
    skipped: { path: string; title: string }[];
}

/**
 * Which of the site's pages a template's pages replace (DEC-182), matched
 * by role and then by address: the template's home page is the site's home
 * page; any other is the site's free-form page at the same address. A
 * template page with no match is made as a new page, unless one of the
 * site's module pages holds its address. Every other page of the site is
 * left alone. Pure: the API writes it and the confirm lists it.
 */
export function starterCopyPlan(
    templatePages: readonly StarterCopyTemplatePage[],
    sitePages: readonly StarterCopySitePage[],
): StarterCopyPlan {
    const plan: StarterCopyPlan = { replace: [], create: [], skipped: [] };
    const home = sitePages.find((p) => p.isHome);
    for (const page of templatePages) {
        const match = page.isHome
            ? home
            : sitePages.find((p) => !p.isHome && p.path === page.path);
        if (match && (match.isHome || (match.kind ?? "FREE") === "FREE")) {
            plan.replace.push({
                pageId: match.id,
                title: match.title,
                from: page.path,
            });
        } else if (match) {
            plan.skipped.push({ path: page.path, title: page.title });
        } else {
            plan.create.push({ path: page.path, title: page.title });
        }
    }
    return plan;
}
