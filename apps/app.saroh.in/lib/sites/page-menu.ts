import type {
    Flag,
    ModulePageKind,
    PageKind,
    SitePage,
} from "@/lib/sites/service";

/**
 * What the editor's page menu says about pages (G16): the module pages it can
 * offer, where each one lives, and how a page in the list is marked. Pure, so
 * the words are tested apart from the menu that draws them.
 *
 * The API decides which kinds can be added (`addablePageKinds`: the module is
 * on, the site has none yet, the caller holds `site:update`) and every rule
 * about addresses. This only names things; it never decides them.
 */

/** A module page as "Add a page" offers it. */
export interface ModulePageOffer {
    kind: ModulePageKind;
    /** Its title, which is also its name in the menu. */
    label: string;
    /** Where it goes: a Book or Shop page's for good, the others' to start. */
    path: string;
    /** What it starts with, in the merchant's words. */
    what: string;
}

/** Every module page, in the order the menu lists them (the API's). */
export const MODULE_PAGE_OFFERS: Record<ModulePageKind, ModulePageOffer> = {
    SHOP: {
        kind: "SHOP",
        label: "Shop",
        path: "/shop",
        what: "Your products, from Sell › Products",
    },
    BOOK: {
        kind: "BOOK",
        label: "Book",
        path: "/book",
        what: "Your services, each opening a time to book",
    },
    PRICES: {
        kind: "PRICES",
        label: "Prices",
        path: "/prices",
        what: "Your plans on sale",
    },
    JOURNAL: {
        kind: "JOURNAL",
        label: "Journal",
        path: "/journal",
        what: "Your latest posts",
    },
    CONTACT: {
        kind: "CONTACT",
        label: "Contact",
        path: "/contact",
        what: "Where to find you, and a message form",
    },
};

const KIND_ORDER: readonly ModulePageKind[] = [
    "SHOP",
    "BOOK",
    "PRICES",
    "JOURNAL",
    "CONTACT",
];

/**
 * What "Add a page" offers above "Blank page": the kinds the API says can be
 * added, in the menu's order. Anything it doesn't know is left out rather
 * than offered with no words (an API newer than this app).
 */
export function addPageOffers(
    addable: readonly string[] | undefined,
): ModulePageOffer[] {
    const allowed = new Set(addable ?? []);
    return KIND_ORDER.filter((kind) => allowed.has(kind)).map(
        (kind) => MODULE_PAGE_OFFERS[kind],
    );
}

export function pageKind(page: Pick<SitePage, "kind">): PageKind {
    return page.kind ?? "FREE";
}

/**
 * A page whose address is its route's and can't change, and what that
 * address is for: the home page ("/"), a Book page ("/book") and a Shop
 * page ("/shop"). Null for a page the merchant may move.
 */
export function fixedAddress(
    page: Pick<SitePage, "isHome" | "kind" | "path">,
): { path: string; purpose: string } | null {
    if (page.isHome)
        return { path: page.path, purpose: "your site's own address" };
    switch (pageKind(page)) {
        case "BOOK":
            return { path: page.path, purpose: "your booking page's address" };
        case "SHOP":
            return { path: page.path, purpose: "your online shop's address" };
        default:
            return null;
    }
}

/**
 * The pre-publish check's word on a free-form page at an address one of the
 * site's own routes answers (G14's `reservedAddress`, on its path): visitors
 * never see it until it moves. Null for every other page.
 */
export function unseenBecause(
    pageId: string,
    flags: readonly Flag[],
): string | null {
    const flag = flags.find(
        (f) =>
            f.type === "reservedAddress" &&
            f.pageId === pageId &&
            f.field === "path",
    );
    return flag ? flag.message : null;
}

/** How a page is marked in the page menu. */
export interface PageMenuMarks {
    /** Hidden from the site: crossed out, as a hidden block is. */
    hidden: boolean;
    /** "Show in menu" is off: "Not in menu". Never said of Home. */
    notInMenu: boolean;
    /** At an address a route answers: "Can't be seen", with Change address. */
    unseen: boolean;
}

export function pageMenuMarks(
    page: SitePage,
    flags: readonly Flag[],
): PageMenuMarks {
    return {
        hidden: page.hidden,
        notInMenu: !page.isHome && page.inMenu === false,
        unseen: unseenBecause(page.id, flags) !== null,
    };
}

/** The option's accessible name: its title, then what the marks say. */
export function pageOptionName(page: SitePage, marks: PageMenuMarks): string {
    return [
        page.title,
        marks.hidden ? "hidden from the site" : null,
        marks.notInMenu ? "not in menu" : null,
        marks.unseen ? "can't be seen at its address" : null,
    ]
        .filter(Boolean)
        .join(", ");
}
