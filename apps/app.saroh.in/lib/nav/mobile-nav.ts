import type {
    NavCounts,
    NavGroup,
    NavItem,
} from "@/components/shared/nav-items";
import {
    isNavChildCurrent,
    isNavItemActive,
    isNavSectionActive,
    navCountFor,
} from "@/components/shared/nav-items";

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

/** The design's default seats, by name, when you are in no section. */
export const DEFAULT_PREFERENCE = [
    "Home",
    "Sell",
    "Notifications",
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

/** The sheet heading over the rows that belong to no section. */
export const WORKSPACE_HEADING = "Workspace";

const isSection = (item: NavItem) =>
    item.children?.some((child) => child.href) ?? false;

/** A section's pages that are destinations (a label row is not). */
const pagesOf = (item: NavItem) =>
    (item.children ?? []).filter(
        (child): child is typeof child & { href: string } =>
            Boolean(child.href) && !child.create,
    );

/**
 * Which rows get the four seats.
 *
 * By a named preference first, then in rail order skipping sections. On a
 * page inside a section — or on Calendar, which the design seats the same
 * way — that place takes the second seat, so where you are is always one tap
 * away. Calendar comes after Sell; Sell gives up its seat to Calendar when it
 * is the section you are in, since it is already seated.
 */
export function seatPreference(currentSection: string | null): string[] {
    if (!currentSection) return [...DEFAULT_PREFERENCE];
    return [
        "Home",
        currentSection,
        currentSection === "Sell" ? "Calendar" : "Sell",
        "Notifications",
    ];
}

/** The one plain row that holds the second seat while you are on it. */
const SEATED_WHEN_CURRENT = "/calendar";

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

    const sectionNow = rows.find(
        (item) =>
            (isSection(item) && isNavSectionActive(pathname, item)) ||
            (item.href === SEATED_WHEN_CURRENT &&
                isNavItemActive(pathname, item.href)),
    );
    const preference = seatPreference(sectionNow?.label ?? null);

    // Seats: preference by name, then rail order without sections.
    const seated: NavItem[] = [];
    const seat = (item: NavItem | undefined) => {
        if (!item || seated.length >= TAB_SEATS || seated.includes(item)) {
            return;
        }
        seated.push(item);
    };
    for (const name of preference) {
        seat(rows.find((item) => item.label === name));
    }
    for (const item of rows) {
        if (!isSection(item)) seat(item);
    }
    // The bar shows them in the order they were seated, as the design does:
    // Home first, and the section you are in beside it.

    const sectionCount = (item: NavItem) =>
        count(item.href) +
        pagesOf(item)
            .filter((page) => page.href !== item.href)
            .reduce((sum, page) => sum + count(page.href), 0);

    const tabs: MobileTab[] = seated.map((item) => {
        const section = isSection(item);
        return {
            key: item.href,
            label: item.label,
            href: section ? (pagesOf(item)[0]?.href ?? item.href) : item.href,
            icon: item.icon,
            count: section ? sectionCount(item) : count(item.href),
            current: section
                ? isNavSectionActive(pathname, item)
                : isNavItemActive(pathname, item.href),
            section,
        };
    });

    // The sheet: every section, seated or not — one tab opens one page, so
    // the rest of a seated section's pages have to be somewhere — then what
    // is left, under Workspace.
    const sheet: MobileSheetGroup[] = [];
    for (const item of rows) {
        if (!isSection(item)) continue;
        const pages = pagesOf(item);
        sheet.push({
            label: item.label,
            rows: pages.map((page) => ({
                key: `${item.href}>${page.href}`,
                label: page.label,
                href: page.href,
                // The parent's icon: the sheet is a column of icons, and a
                // page's own would be decoration the rail never drew.
                icon: item.icon,
                count: count(page.href),
                current: isNavChildCurrent(pathname, page.href, pages),
            })),
        });
    }
    const rest = rows.filter(
        (item) => !isSection(item) && !seated.includes(item),
    );
    if (rest.length > 0) {
        sheet.push({
            label: WORKSPACE_HEADING,
            rows: rest.map((item) => ({
                key: item.href,
                label: item.label,
                href: item.href,
                icon: item.icon,
                count: count(item.href),
                current: isNavItemActive(pathname, item.href),
            })),
        });
    }
    const groupsWithRows = sheet.filter((group) => group.rows.length > 0);

    // More counts what is waiting only in the sheet. A seated section's pages
    // are listed there too, but their work already shows on that section's
    // tab — counting it twice would say twice as much is waiting.
    const seatedHrefs = new Set(
        seated.flatMap((item) => [
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
