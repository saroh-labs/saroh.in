import type { LookId } from "@saroh/block-contract";

import type { TemplateManifest } from "./manifest";
import { getTemplate } from "./registry";
import { BAKERY_TEMPLATE_ID } from "./templates/bakery";
import { GYM_TEMPLATE_ID } from "./templates/gym";
import { SALON_TEMPLATE_ID } from "./templates/salon";
import { STUDIO_TEMPLATE_ID } from "./templates/studio";

/** A choice in the editor's Look row: one of the looks, or Classic. */
export type ShowcaseLook = LookId | "classic";

/**
 * The template each look's Preview shows (DEC-182): the one that shows
 * best what the look and its sections can do, filled with its gallery
 * sample words and pictures. "Use this look with its starter content"
 * copies the same template's pages into the draft.
 *
 * Folio uses Studio until a Yoga or Classes template exists (Folio's own
 * industries, `TEMPLATE_LOOKS`). Every template named here has gallery
 * samples (`look-showcase.test.ts`).
 */
export const LOOK_SHOWCASE_TEMPLATE: Readonly<Record<ShowcaseLook, string>> = {
    quiet: SALON_TEMPLATE_ID,
    live: GYM_TEMPLATE_ID,
    folio: STUDIO_TEMPLATE_ID,
    classic: BAKERY_TEMPLATE_ID,
};

/** The showcase template for a look (null is Classic), latest version. */
export function lookShowcaseTemplate(
    look: LookId | null | undefined,
): TemplateManifest {
    const id = LOOK_SHOWCASE_TEMPLATE[look ?? "classic"];
    const template = getTemplate(id);
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
