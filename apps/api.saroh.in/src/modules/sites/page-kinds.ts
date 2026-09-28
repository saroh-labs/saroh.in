import type { PageKind } from "@saroh/database";

/**
 * Module pages (round-2 G14, DEC-046): a `Page` with a kind other than FREE.
 *
 * A site may hold one page of each kind — Shop, Book, Prices, Journal,
 * Contact — beside its free-form pages. It is an ordinary page: its sections
 * are ordinary sections (so notes, versions and the snapshot keep working),
 * it is published like any page, and its title is also its menu name.
 *
 * - **Book and Shop have fixed addresses**, `/book` and `/shop`, which are
 *   their routes' (G15 draws the page there). The title and menu name can
 *   change; the address can't.
 * - **Prices, Journal and Contact** default to `/prices`, `/journal` and
 *   `/contact`, and the merchant may move them.
 * - **A kind whose module is off can't be added.** One whose module isn't
 *   rolled out for the business is never offered at all (DEC-057), and a
 *   refusal never names it.
 *
 * Existing sites get none of these on their own; the merchant adds them.
 */

/** Every module page kind, in the order the menu lists them. */
export const MODULE_PAGE_KINDS = [
    "SHOP",
    "BOOK",
    "PRICES",
    "JOURNAL",
    "CONTACT",
] as const satisfies readonly PageKind[];
export type ModulePageKind = (typeof MODULE_PAGE_KINDS)[number];

/** Every page kind, FREE first. */
export const PAGE_KINDS = [
    "FREE",
    ...MODULE_PAGE_KINDS,
] as const satisfies readonly PageKind[];

export function isModulePageKind(
    kind: string | null | undefined,
): kind is ModulePageKind {
    return (MODULE_PAGE_KINDS as readonly string[]).includes(kind ?? "");
}

interface KindDefaults {
    /** The page's title and menu name when the merchant gives none. */
    title: string;
    /** The page's address, or its default one. */
    path: string;
    /** Whether the address is the route's and can never change. */
    fixedPath: boolean;
    /** Addresses to offer when the default is taken, best first. */
    alternatives: readonly string[];
    /** "a Book page", for sentences. */
    name: string;
}

export const MODULE_PAGE_DEFAULTS: Record<ModulePageKind, KindDefaults> = {
    SHOP: {
        title: "Shop",
        path: "/shop",
        fixedPath: true,
        alternatives: [],
        name: "a Shop page",
    },
    BOOK: {
        title: "Book",
        path: "/book",
        fixedPath: true,
        alternatives: [],
        name: "a Book page",
    },
    PRICES: {
        title: "Prices",
        path: "/prices",
        fixedPath: false,
        alternatives: ["/pricing", "/rates"],
        name: "a Prices page",
    },
    JOURNAL: {
        title: "Journal",
        path: "/journal",
        fixedPath: false,
        alternatives: ["/news", "/updates"],
        name: "a Journal page",
    },
    CONTACT: {
        title: "Contact",
        path: "/contact",
        fixedPath: false,
        alternatives: ["/contact-us", "/get-in-touch"],
        name: "a Contact page",
    },
};

/**
 * Addresses a page can't have (round-2 G14): the site's own routes own them.
 *
 * `/book` is the booking page and `/shop` the shop, each a route of its own
 * that a Book or Shop module page dresses; `/checkout` is where a customer
 * pays. Everything under them belongs to the route too (`/book/…`,
 * `/shop/<product>`, `/checkout/<order>`). Only the module page of that kind
 * may sit at the address itself, and nothing may sit under it.
 *
 * `purpose` finishes the sentence "/book is …" in the merchant's words.
 */
export const RESERVED_PAGE_PATHS: readonly {
    root: string;
    kind: PageKind | null;
    purpose: string;
}[] = [
    { root: "/book", kind: "BOOK", purpose: "your booking page" },
    { root: "/shop", kind: "SHOP", purpose: "your shop" },
    { root: "/checkout", kind: null, purpose: "where your customers pay" },
];

/** The reserved address a path sits at or under, or null. */
export function reservedPathFor(
    path: string,
): (typeof RESERVED_PAGE_PATHS)[number] | null {
    const p = path.toLowerCase().replace(/\/+$/, "");
    return (
        RESERVED_PAGE_PATHS.find(
            (r) => p === r.root || p.startsWith(`${r.root}/`),
        ) ?? null
    );
}

/**
 * Whether a route owns `path` against a page of `kind`: true for any page
 * under a reserved address, and for any page at one but its own module page.
 */
export function reservedAgainst(path: string, kind: PageKind): boolean {
    const reserved = reservedPathFor(path);
    if (!reserved) return false;
    return !(reserved.kind === kind && path === reserved.root);
}
