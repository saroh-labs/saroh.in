import type { LookId } from "@saroh/block-contract";

import type { SiteNavItem } from "./site-header-menu";

/**
 * What the chrome (header, phone menu, footer, Book bar and dock) shares
 * under a look (DEC-172, plan U5, #1092). A plain module: the server's
 * header and footer and the browser's menu, bar and dock read one list.
 *
 * The rules every look's chrome keeps (the audits' fix rules):
 *
 * - ONE FILLED BUTTON PER VIEW. The page marks its own main action; while
 *   it is on screen the header's Book is an outline, and it fills once the
 *   page's has scrolled away (`sticky-actions.tsx`). On `/book` the header
 *   has no Book, and on the shop's pages the header holds the bag only.
 * - ONE FIXED BAR ON A PHONE. The header scrolls away with the page on a
 *   phone; the Book bar (Folio, Quiet) or the dock (Live) is the one bar,
 *   and it waits while the consent banner, a sheet or the menu is open.
 * - 44PX TARGETS for every control in the header, the menu, the footer,
 *   the bar and the dock, on every pointer.
 * - VISIT US IN EVERY HEADER, while the business has a place or a way to
 *   reach it to show: it opens the footer's facts.
 * - The business's own WhatsApp chat link stays wherever it was.
 *
 * Classic (no look) draws none of this: its chrome is unchanged.
 */

/**
 * Who is looking, as the chrome may say it (U5): `null` when the site has
 * no customer accounts (`SITE_ACCOUNT_AREA` off), so nothing is offered.
 * Read on the server, but drawn only in the browser (`footer-session-links`,
 * the menu), so the HTML a page cache keeps for everyone names no one and
 * holds no account links.
 */
export interface SiteSession {
    signedIn: boolean;
    /** The account has a Bookings tab worth a link: the site books. */
    bookings?: boolean;
    /** The account has an Orders tab worth a link: the site sells. */
    orders?: boolean;
}

/** Where "Visit us" goes: the footer's facts, on every page. */
export const VISIT_US_ID = "site-visit";
export const VISIT_US_HREF = `#${VISIT_US_ID}`;
export const VISIT_US_LABEL = "Visit us";

/** An entry that already opens where to find the business. */
function isVisitEntry(item: SiteNavItem): boolean {
    if (item.kind === "VISIT") return true;
    if (/^visit\b/i.test(item.label.trim())) return true;
    const hash = item.href.split("#")[1]?.toLowerCase() ?? "";
    return hash === "visit" || hash === "visit-us" || hash === VISIT_US_ID;
}

/**
 * The header's menu with "Visit us" at its end (U5), unless an entry of
 * the merchant's already is it (their own Visit page, or a jump to their
 * Visit us section). A Contact page is not it: "Visit us" says where. `shows` is whether the footer has
 * facts to open: a business with no place, phone, email or social link has
 * nothing to visit, and gets no entry that lands on nothing.
 */
export function withVisitUs<T extends SiteNavItem>(
    items: readonly T[],
    shows: boolean,
): (T | SiteNavItem)[] {
    if (!shows || items.some(isVisitEntry)) return [...items];
    return [...items, { label: VISIT_US_LABEL, href: VISIT_US_HREF }];
}

/** One tab of Live's dock. */
export interface DockTab {
    key: string;
    label: string;
    href: string;
    icon: "home" | "book" | "shop" | "you" | "page";
    /** The site's main action: filled in the accent once the page's own is off screen. */
    primary?: boolean;
}

/** How many tabs the dock holds at most: five fit 390px at 44px each. */
export const DOCK_MAX = 5;

/**
 * Live's dock (U5, VB01HomePhone): Home, the site's own pages to fill it,
 * its main action, the shop while it serves and isn't the main action, and
 * the account while the site has one. Five at most; the main action, the
 * shop and the account are kept before a page is.
 */
export function dockTabs({
    home,
    pages,
    action,
    shopHref,
    accountHref,
}: {
    home: string;
    /** The header's menu less the main action's page, already prefixed. */
    pages: readonly SiteNavItem[];
    action: { label: string; href: string } | null;
    /** `/shop`, while it serves and the main action isn't Order. */
    shopHref?: string | null;
    /** `/account`, while the site has customer accounts. */
    accountHref?: string | null;
}): DockTab[] {
    const fixed: DockTab[] = [];
    if (action) {
        fixed.push({
            key: "action",
            label: action.label,
            href: action.href,
            icon: action.href.includes("/shop") ? "shop" : "book",
            primary: true,
        });
    }
    if (shopHref) {
        fixed.push({
            key: "shop",
            label: "Shop",
            href: shopHref,
            icon: "shop",
        });
    }
    if (accountHref) {
        fixed.push({
            key: "you",
            label: "You",
            href: accountHref,
            icon: "you",
        });
    }
    const room = Math.max(0, DOCK_MAX - 1 - fixed.length);
    const taken = new Set([home, ...fixed.map((t) => t.href)]);
    const own = pages
        .filter(
            (p) =>
                !p.href.includes("#") &&
                p.href !== "" &&
                !taken.has(p.href) &&
                p.kind !== "SHOP",
        )
        .slice(0, room)
        .map((p): DockTab => ({
            key: `page:${p.href}`,
            label: p.label,
            href: p.href,
            icon: "page",
        }));
    const home0: DockTab = {
        key: "home",
        label: "Home",
        href: home,
        icon: "home",
    };
    // The action in the middle, in the thumb's reach, with Home and the
    // pages before it and the shop and You after (VB: Home, Timetable,
    // Book, Plans, You).
    const main = fixed.filter((t) => t.primary);
    const rest = [home0, ...own, ...fixed.filter((t) => !t.primary)];
    const middle = Math.floor((rest.length + main.length) / 2);
    return [...rest.slice(0, middle), ...main, ...rest.slice(middle)];
}

/** Which looks draw a phone Book bar (Live has its dock instead). */
export function lookHasBookBar(look: LookId): boolean {
    return look !== "live";
}
