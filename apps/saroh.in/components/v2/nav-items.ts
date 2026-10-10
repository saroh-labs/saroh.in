import { featureHref, featureList } from "@/content/features";
import type { ResourcePage } from "@/content/resources";
import { solutionHref, solutionList } from "@/content/solutions";

export interface NavItem {
    name: string;
    line: string;
    href: string;
}

/** The Features menu: eight items, each with its line (the Nav design). */
export const FEATURE_ITEMS: NavItem[] = featureList.map((f) => ({
    name: f.name,
    line: f.navLine,
    href: featureHref(f.slug),
}));

/** The Solutions menu: three items. */
export const SOLUTION_ITEMS: NavItem[] = solutionList.map((s) => ({
    name: s.name,
    line: s.navLine,
    href: solutionHref(s.slug),
}));

/**
 * The Resources menu, and the Tools menu: the pages `content/resources.ts`
 * shows now, which the server works out (published, and built) and hands to
 * the nav.
 */
export function resourceItems(pages: readonly ResourcePage[]): NavItem[] {
    return pages.map((p) => ({ name: p.name, line: p.line, href: p.href }));
}

export type NavSection =
    "features" | "solutions" | "pricing" | "resources" | "tools" | null;

/** Whether `pathname` is the page `href` or a page under it. */
const within = (pathname: string, href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

/** Which top-level section a path is in, for the saffron underline. */
export function sectionOf(
    pathname: string,
    resources: readonly NavItem[] = [],
    tools: readonly NavItem[] = [],
): NavSection {
    if (FEATURE_ITEMS.some((i) => i.href === pathname)) return "features";
    if (SOLUTION_ITEMS.some((i) => i.href === pathname)) return "solutions";
    if (pathname === "/pricing") return "pricing";
    if (resources.some((i) => within(pathname, i.href))) return "resources";
    if (tools.some((i) => within(pathname, i.href))) return "tools";
    return null;
}
