import type {
    NavCounts,
    NavGroup,
    NavItem,
} from "@/components/shared/navigation/nav-items";
import {
    isNavChildCurrent,
    isNavSectionActive,
    navCountFor,
} from "@/components/shared/navigation/nav-items";

/**
 * The phone's navigation: four tabs, then More (the "Saroh Tab Bar" design,
 * `saroh-mobile-nav.js` `buildMobileNav`).
 *
 * Built from the SAME rows the rail draws — `navFor`'s output, already
 * narrowed by role, permissions and module — so the bar can never offer what
 * the rail withholds. This only decides which of those rows get a seat.
 *
 * Pure, so the seating rules are tested without a browser.
 */

/** How many real tabs the bar holds before More. */
export const TAB_SEATS = 4;

/**
 * The rows that hold the seats, by name, when the actor has them: the bar's
 * tabs before the regroup (Sell's seat opened Orders). The rest of the
 * seats go to the rail's next rows, in its order (DEC-263).
 */
export const DEFAULT_PREFERENCE = [
    "Home",
    "Business calendar",
    "Orders",
    "Insights",
] as const;

type Icon = NavItem["icon"];

export interface MobileTab {
    /** The rail row this tab stands for — a stable key. */
    key: string;
    label: string;
    /**
     * Where the tab goes. A section opens its first page (Sell → Orders):
     * one tab can only open one of them, and the rest are in the sheet.
     */
    href: string;
    icon: Icon;
    /** Work waiting behind it; a section sums its pages. */
    count: number;
    current: boolean;
    /** A section holding a seat, rather than a single destination. */
    section: boolean;
}

export interface MobileSheetRow {
    key: string;
    label: string;
    href: string;
    /** A section's pages carry the section's icon; see `buildMobileNav`. */
    icon: Icon;
    count: number;
    current: boolean;
}

export interface MobileSheetGroup {
    label: string;
    rows: MobileSheetRow[];
}

export interface MobileNav {
    tabs: MobileTab[];
    /** `null` when the sheet would be empty — no More tab then. */
    more: { count: number } | null;
    groups: MobileSheetGroup[];
    /** The sheet's footer line. */
    note: string;
}

const isSection = (item: NavItem) =>
    item.children?.some((child) => child.href) ?? false;

/** A section's pages that are destinations (a label row is not). */
const pagesOf = (item: NavItem) =>
    (item.children ?? []).filter(
        (child): child is typeof child & { href: string } =>
            Boolean(child.href) && !child.create,
    );

/**
 * One fixed order everywhere (DEC-263): the seats are the preferred rows
 * the actor has, then the rail's next rows, and they are drawn in the
 * rail's order. The page you are on never moves a tab; a row a gate leaves
 * out is simply absent and the rest keep their order. No tab is chosen by
 * the business's trade.
 */
export function buildMobileNav({
    groups,
    pathname,
    counts,
    unread = 0,
}: {
    /** `navFor`'s output: already filtered for this actor. */
    groups: readonly NavGroup[];
    pathname: string;
    counts?: NavCounts;
    unread?: number;
}): MobileNav {
    const rows = groups.flatMap((group) => group.items);
    const count = (href?: string) => navCountFor(href, counts, unread);
    const active = (item: NavItem) => isNavSectionActive(pathname, item, rows);

    const seated = new Set<NavItem>();
    const seat = (item: NavItem | undefined) => {
        if (item && seated.size < TAB_SEATS) seated.add(item);
    };
    for (const name of DEFAULT_PREFERENCE) {
        seat(rows.find((item) => item.label === name));
    }
    for (const item of rows) {
        if (!isSection(item)) seat(item);
    }

    const sectionCount = (item: NavItem) =>
        count(item.href) +
        pagesOf(item)
            .filter((page) => page.href !== item.href)
            .reduce((sum, page) => sum + count(page.href), 0);

    const tabs: MobileTab[] = rows
        .filter((item) => seated.has(item))
        .map((item) => {
            const section = isSection(item);
            return {
                key: item.href,
                label: item.shortLabel ?? item.label,
                href: section
                    ? (pagesOf(item)[0]?.href ?? item.href)
                    : item.href,
                icon: item.icon,
                count: section ? sectionCount(item) : count(item.href),
                current: active(item),
                section,
            };
        });

    // The sheet: the rail's groups, in its order, with what has no seat —
    // a section's pages all, since one tab opens one of them.
    const sheet: MobileSheetGroup[] = groups.map((group, i) => ({
        label: group.label ?? `group-${i}`,
        rows: group.items.flatMap((item): MobileSheetRow[] => {
            if (isSection(item)) {
                const pages = pagesOf(item);
                return pages.map((page) => ({
                    key: `${item.href}>${page.href}`,
                    label: page.label,
                    href: page.href,
                    // The parent's icon: a page's own would be decoration
                    // the rail never drew.
                    icon: item.icon,
                    count: count(page.href),
                    current: isNavChildCurrent(pathname, page.href, pages),
                }));
            }
            if (seated.has(item)) return [];
            return [
                {
                    key: item.href,
                    label: item.label,
                    href: item.href,
                    icon: item.icon,
                    count: count(item.href),
                    current: active(item),
                },
            ];
        }),
    }));
    const groupsWithRows = sheet.filter((group) => group.rows.length > 0);

    // More counts what is waiting only in the sheet. A seated section's pages
    // are listed there too, but their work already shows on its tab.
    const seatedHrefs = new Set(
        Array.from(seated).flatMap((item) => [
            item.href,
            ...pagesOf(item).map((p) => p.href),
        ]),
    );
    const moreCount = groupsWithRows
        .flatMap((group) => group.rows)
        .filter((row) => !seatedHrefs.has(row.href))
        .reduce((sum, row) => sum + row.count, 0);

    return {
        tabs,
        more: groupsWithRows.length > 0 ? { count: moreCount } : null,
        groups: groupsWithRows,
        note: `Everything a role reaches is here. The bar holds the ${tabs.length} opened most.`,
    };
}
