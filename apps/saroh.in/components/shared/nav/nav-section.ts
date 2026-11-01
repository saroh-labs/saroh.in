/**
 * What the nav's client code needs, kept apart from `nav-items.ts`: that
 * file reads every feature's and solution's page copy, which the server
 * turns into menu items and hands to the nav, so none of it is sent to the
 * browser.
 */
export interface NavItem {
    name: string;
    /** Under the name in a menu; empty where the name says it all. */
    line: string;
    href: string;
    /** Its column's heading in a desk menu; the other menus and lists ignore it. */
    group?: string;
    /** The footer's small "new" tag beside it. */
    isNew?: boolean;
}

/** A plain link in a menu: its "see all" or the quieter ones beside it. */
export interface MenuLink {
    name: string;
    href: string;
}

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

/**
 * Items in columns: one per `group` where they have them, else `flat` columns
 * filled top to bottom. The phone sheet's one list uses the same headings.
 */
export function menuColumns(items: readonly NavItem[], flat: number) {
    if (items.some((i) => i.group)) {
        const groups = new Map<string, NavItem[]>();
        for (const item of items) {
            const group = item.group ?? "More";
            groups.set(group, [...(groups.get(group) ?? []), item]);
        }
        return [...groups].map(([heading, inIt]) => ({ heading, items: inIt }));
    }
    const size = Math.ceil(items.length / flat);
    return Array.from({ length: flat }, (_, i) => ({
        heading: undefined,
        items: items.slice(i * size, (i + 1) * size),
    })).filter((c) => c.items.length > 0);
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
