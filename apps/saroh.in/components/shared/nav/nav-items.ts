import { featureHref, featureList } from "@/content/features";
import type { ResourcePage } from "@/content/resources";
import { solutionHref, solutionList } from "@/content/solutions";
import type { SolutionSlug } from "@/content/types";

import type { NavItem } from "./nav-section";

export type { NavItem, NavSection } from "./nav-section";

/** The Features menu: eight items, each with its line (the Nav design). */
export const FEATURE_ITEMS: NavItem[] = featureList.map((f) => ({
    name: f.name,
    line: f.navLine,
    href: featureHref(f.slug),
}));

/**
 * The Solutions menu, each solution at `href(slug)`: the server passes its
 * /for/ page once that is live (`solutionLink`, DEC-193).
 */
export const solutionItems = (
    href: (slug: SolutionSlug) => string = solutionHref,
): NavItem[] =>
    solutionList.map((s) => ({
        name: s.name,
        line: s.navLine,
        href: href(s.slug),
    }));

/** The Solutions menu at the /solutions/ addresses. */
export const SOLUTION_ITEMS: NavItem[] = solutionItems();

/**
 * The Resources menu, and the Tools menu: the pages `content/resources.ts`
 * shows now, which the server works out (published, and built) and hands to
 * the nav.
 */
export function resourceItems(pages: readonly ResourcePage[]): NavItem[] {
    return pages.map((p) => ({ name: p.name, line: p.line, href: p.href }));
}
