import type { MenuLink, NavItem, NavSection } from "@saroh/marketing/nav-types";

/**
 * What the nav's client code needs, kept apart from `nav-items.ts`: that
 * file reads every feature's and solution's page copy, which the server
 * turns into menu items and hands to the nav, so none of it is sent to the
 * browser.
 */
export type { MenuLink, NavItem, NavSection } from "@saroh/marketing/nav-types";

/** What the nav draws its menus from, handed down by the server. */
export interface NavMenus {
    /** The Features menu (`FEATURE_ITEMS`). */
    features: NavItem[];
    /** The Solutions menu, as the server links it (`solutionLink`). */
    solutions: NavItem[];
    /** The Solutions menu when it differs: every live trade, by family. */
    solutionMenu?: NavItem[];
    /** The Solutions menu's "see all", once the /for hub has a page. */
    allTrades?: MenuLink;
    /** The Tools menu's "see all", once the /tools hub has a page. */
    allTools?: MenuLink;
    resources?: NavItem[];
    tools?: NavItem[];
}

/** The Resources menu's quieter links: the footer's own three. */
export const ABOUT_LINKS: MenuLink[] = [
    { name: "About", href: "/about" },
    { name: "Questions", href: "/#faq" },
    { name: "Contact", href: "/contact" },
];

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
