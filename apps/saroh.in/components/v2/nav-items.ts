import { featureHref, featureList } from "@/content/features";
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

export type NavSection = "features" | "solutions" | null;

/** Which top-level section a path is in, for the saffron underline. */
export function sectionOf(pathname: string): NavSection {
    if (FEATURE_ITEMS.some((i) => i.href === pathname)) return "features";
    if (SOLUTION_ITEMS.some((i) => i.href === pathname)) return "solutions";
    return null;
}
