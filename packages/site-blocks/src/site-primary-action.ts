import { trimTrailingSlashes } from "./url-path";

/**
 * The one thing a site asks of a visitor.
 *
 * A site has ONE primary action, and the header, the hero and the closing
 * band agree on it. Before this rule the header could show "Book" while the
 * menu listed "Book a walkthrough" and the hero had a button of its own:
 * three asks, and no one thing asked.
 *
 * The rule, from what the site has now:
 *
 * - it takes bookings here: **Book**, to `/book`;
 * - else it sells here: **Order**, to `/shop`;
 * - else it has a contact page: **Contact us**, to that page;
 * - else nothing. A header with no button is better than one that promises
 *   a page the site doesn't have.
 *
 * Booking leads when a site does both, as the header always had it: a time
 * is the scarcer thing, and the shop keeps its own entry in the menu.
 * `SITE_PRIMARY_ORDER` is that order, in one place.
 *
 * Pure, and free of `"use client"`: the layout calls it on the server, and
 * a template's hero and closing band read the same answer.
 */
export type SitePrimaryKind = "book" | "shop" | "contact";

export interface SitePrimaryAction {
    kind: SitePrimaryKind;
    label: string;
    href: string;
}

/** Which action leads when a site has more than one. */
export const SITE_PRIMARY_ORDER: readonly SitePrimaryKind[] = [
    "book",
    "shop",
    "contact",
];

/** Each action's words and its usual address. */
export const SITE_PRIMARY_ACTIONS: Readonly<
    Record<SitePrimaryKind, { label: string; href: string }>
> = {
    book: { label: "Book", href: "/book" },
    shop: { label: "Order", href: "/shop" },
    contact: { label: "Contact us", href: "/contact" },
};

/** The module page kind (`SiteNavItem.kind`) each action opens. */
const PAGE_KIND: Readonly<Record<SitePrimaryKind, string>> = {
    book: "BOOK",
    shop: "SHOP",
    contact: "CONTACT",
};

/**
 * The site's primary action, or null when it has none.
 *
 * - `books`: the booking page would take a booking now;
 * - `sells`: `/shop` serves now;
 * - `contactHref`: the site's contact page, when it has one that shows
 *   (`contactPageHref`).
 */
export function sitePrimaryAction({
    books,
    sells,
    contactHref = null,
}: {
    books: boolean;
    sells: boolean;
    contactHref?: string | null;
}): SitePrimaryAction | null {
    const contact = contactHref?.trim() ?? "";
    const has: Record<SitePrimaryKind, boolean> = {
        book: books,
        shop: sells,
        contact: contact !== "",
    };
    const kind = SITE_PRIMARY_ORDER.find((k) => has[k]);
    if (!kind) return null;
    return {
        kind,
        label: SITE_PRIMARY_ACTIONS[kind].label,
        href: kind === "contact" ? contact : SITE_PRIMARY_ACTIONS[kind].href,
    };
}

/** A page or a menu entry: an address, and its module kind when it has one. */
interface KindedEntry {
    href: string;
    kind?: string | null;
}

/** "/contact/" and "/contact" are one page; a query or an anchor isn't part of it. */
function pagePath(href: string): string {
    const path = (href.split(/[?#]/)[0] ?? href).toLowerCase();
    return path.length > 1 ? trimTrailingSlashes(path) : path;
}

/**
 * The site's contact page, or null: its Contact module page while that
 * shows, else a page of its own at `/contact`. Never an entry that jumps to
 * a section (`/#contact`), which is not a page.
 */
export function contactPageHref(
    entries: readonly KindedEntry[],
    modules?: Partial<Record<string, "on" | "off">> | null,
): string | null {
    if (modules?.CONTACT !== "off") {
        const page = entries.find((e) => e.kind === PAGE_KIND.contact);
        if (page) return page.href;
    }
    const own = entries.find(
        (e) =>
            (!e.kind || e.kind === "FREE") &&
            !e.href.includes("#") &&
            pagePath(e.href) === SITE_PRIMARY_ACTIONS.contact.href,
    );
    return own?.href ?? null;
}

/** Whether a menu entry opens the page the action opens. */
export function opensPrimaryAction(
    entry: KindedEntry,
    action: { href: string; kind?: SitePrimaryKind | null },
): boolean {
    // A jump to a section of a page is not that page.
    if (entry.href.includes("#")) return false;
    if (action.kind && entry.kind === PAGE_KIND[action.kind]) return true;
    return pagePath(entry.href) === pagePath(action.href);
}

/** An entry that opens the home page. */
function isHome(entry: KindedEntry): boolean {
    return entry.href === "/" || entry.href === "";
}

/**
 * The menu without the page the primary action opens: the button beside it
 * already goes there, and saying it twice is two asks.
 *
 * A menu left holding only Home once that entry is gone is no menu, as
 * `siteMenu` has it; one the merchant published as Home alone is theirs.
 * With no action the menu comes back as it was.
 */
export function withoutPrimaryAction<T extends KindedEntry>(
    menu: readonly T[],
    action: { href: string; kind?: SitePrimaryKind | null } | null | undefined,
): T[] {
    if (!action) return [...menu];
    const kept = menu.filter((entry) => !opensPrimaryAction(entry, action));
    if (kept.length < menu.length && kept.every(isHome)) return [];
    return kept;
}

/**
 * What kind of page a path is, as the chrome under a look needs to know it
 * (DEC-172, U5): the page that books, the shop's pages (its grid, a
 * product, checkout), or any other page. `basePath` is the draft
 * preview's prefix, "" on a live site.
 */
export type ChromePageKind = "book" | "shop" | "page";

export function chromePageKind(
    path: string | null,
    basePath = "",
): ChromePageKind | null {
    if (path === null) return null;
    let own = path;
    if (basePath && own.startsWith(basePath)) own = own.slice(basePath.length);
    const page = pagePath(own === "" ? "/" : own);
    const under = (root: string) =>
        page === root || page.startsWith(`${root}/`);
    if (under("/book")) return "book";
    if (under("/shop") || under("/checkout")) return "shop";
    return "page";
}

/**
 * Whether the header's main button shows on a page, under a look (U5:
 * one filled button per page type). Never on the page it opens (on
 * `/book` the step's own action is the one button), and never on the
 * shop's pages, where the header holds the bag only and the filled button
 * is Add to bag or Check out. While the path is not known yet (the
 * server's render), it shows: the browser settles it.
 */
export function chromeActionShows(
    path: string | null,
    action: { href: string } | null,
    basePath = "",
): boolean {
    if (!action) return false;
    const kind = chromePageKind(path, basePath);
    if (kind === null) return true;
    if (kind === "shop") return false;
    if (kind === "book") return false;
    return path === null || pagePath(path) !== pagePath(action.href);
}
