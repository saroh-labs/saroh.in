/**
 * What the nav's client code needs, kept apart from `nav-items.ts`: that
 * file reads every feature's and solution's page copy, which the server
 * turns into menu items and hands to the nav, so none of it is sent to the
 * browser.
 */
export interface NavItem {
    name: string;
    line: string;
    href: string;
}

export type NavSection =
    "features" | "solutions" | "pricing" | "resources" | "tools" | null;

/** Whether `pathname` is the page `href` or a page under it. */
const within = (pathname: string, href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

/** Which top-level section a path is in, for the saffron underline. */
export function sectionOf(
    pathname: string,
    features: readonly NavItem[],
    solutions: readonly NavItem[],
    resources: readonly NavItem[] = [],
    tools: readonly NavItem[] = [],
): NavSection {
    if (features.some((i) => i.href === pathname)) return "features";
    if (
        solutions.some((i) => i.href === pathname) ||
        within(pathname, "/for")
    ) {
        return "solutions";
    }
    if (pathname === "/pricing") return "pricing";
    if (resources.some((i) => within(pathname, i.href))) return "resources";
    // The /tools hub too (#1253), which no menu item is.
    if (
        tools.some((i) => within(pathname, i.href)) ||
        within(pathname, "/tools")
    )
        return "tools";
    return null;
}
