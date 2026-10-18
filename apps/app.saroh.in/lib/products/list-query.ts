import { DEFAULT_PAGE_SIZE, readPageSize } from "@saroh/ui/lib/paging";

import type { CatalogueView, ProductStatus } from "./service";

/**
 * The Products list's address (#519). Everything that narrows it — the chip,
 * the search, the storefront, the status, a category or a collection —
 * lives in the URL, so a narrowed list is a link someone can share, and the
 * server reads it once to ask the API for one page. Pure.
 *
 * Paging is by number, as on Orders: the address carries `page` (from 1)
 * and `size` (rows a page; 50 unless chosen), so the footer can offer any
 * page.
 */
export interface ListQuery {
    view: CatalogueView;
    q: string;
    storefront: string | null;
    status: ProductStatus | null;
    /** A category's id, or "none" for Uncategorized. */
    category: string | null;
    /** Products choosing their variants by this option (Settings › Options). */
    option: string | null;
    collection: string | null;
    /** The page on screen, from 1. */
    page: number;
    /** Rows a page: 10, 25, 50 or 100. */
    size: number;
}

/** Rows a page before anyone chooses (the API's own default). */
export const PRODUCTS_PAGE_SIZE = DEFAULT_PAGE_SIZE;

type Params = Record<string, string | string[] | undefined>;

const VIEWS: readonly CatalogueView[] = [
    "all",
    "collections",
    "inventory",
    "needs",
];
/** The views that are tabs of the screen, written as `?tab=`. */
const TAB_VIEWS: readonly CatalogueView[] = ["collections", "inventory"];
const STATUSES: readonly ProductStatus[] = ["PUBLISHED", "DRAFT", "ARCHIVED"];

function one(params: Params, key: string): string | undefined {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() ? value.trim() : undefined;
}

/**
 * What the address asks for. Collections and Inventory are the screen's
 * tabs, so they are `?tab=`; "Show only these" is the list's saved filter,
 * `?view=needs`. A link from before the tabs moved (`?view=collections`)
 * still lands on its tab. An unknown one is "All"; the old "Needs restock"
 * chip (`?view=restock`) is "Show only these". An address with no size
 * opens at `remembered`, the size this browser last chose.
 */
export function readListQuery(
    params: Params,
    remembered: number = PRODUCTS_PAGE_SIZE,
): ListQuery {
    const page = Number(one(params, "page"));
    const tab = one(params, "tab");
    const view = TAB_VIEWS.find((v) => v === tab) ?? one(params, "view");
    const status = one(params, "status");
    return {
        view:
            view === "restock"
                ? "needs"
                : (VIEWS.find((v) => v === view) ?? "all"),
        q: one(params, "q") ?? "",
        storefront: one(params, "storefront") ?? null,
        status: STATUSES.find((s) => s === status) ?? null,
        category: one(params, "category") ?? null,
        option: one(params, "option") ?? null,
        collection: one(params, "collection") ?? null,
        page: Number.isInteger(page) && page >= 1 ? page : 1,
        size: readPageSize(one(params, "size"), remembered),
    };
}

/**
 * The list at `query` with `patch` applied; defaults leave the URL.
 * Changing what is listed (the chip, the search, the storefront, a filter)
 * or the size starts again at the first page, because page 3 of another
 * list is somebody else's page 3.
 */
export function listHref(
    query: ListQuery,
    patch: Partial<ListQuery> = {},
): string {
    const relists = Object.keys(patch).some((key) => key !== "page");
    const next: ListQuery = {
        ...query,
        ...(relists ? { page: 1 } : {}),
        ...patch,
    };
    const q = new URLSearchParams();
    if (TAB_VIEWS.includes(next.view)) q.set("tab", next.view);
    else if (next.view !== "all") q.set("view", next.view);
    if (next.q) q.set("q", next.q);
    if (next.storefront) q.set("storefront", next.storefront);
    if (next.status) q.set("status", next.status);
    if (next.category) q.set("category", next.category);
    if (next.option) q.set("option", next.option);
    if (next.collection) q.set("collection", next.collection);
    if (next.page > 1) q.set("page", String(next.page));
    if (next.size !== PRODUCTS_PAGE_SIZE) q.set("size", String(next.size));
    const s = q.toString();
    return s ? `/commerce/products?${s}` : "/commerce/products";
}

/**
 * The Collections chip with the collection sheet open on a new one (#524):
 * the empty state's New collection, as a link.
 */
export function newCollectionHref(query: ListQuery): string {
    const href = listHref(query, { view: "collections", collection: null });
    return `${href}${href.includes("?") ? "&" : "?"}new=collection`;
}

/** The list at page `page`, everything else kept. */
export function pageHref(query: ListQuery, page: number): string {
    return listHref(query, { page });
}

/**
 * The API request for `query`: its filters, leaving out what it doesn't
 * narrow, and the page asked by its number at the size on screen.
 */
export function catalogueFilter(query: ListQuery) {
    return {
        view: query.view === "all" ? undefined : query.view,
        q: query.q || undefined,
        storefront: query.storefront ?? undefined,
        status: query.status ?? undefined,
        category: query.category ?? undefined,
        option: query.option ?? undefined,
        collection: query.collection ?? undefined,
        page: query.page > 1 ? query.page : undefined,
        size: query.size,
    };
}

/** What an empty list says, and the one action that fills it. */
export interface EmptyCopy {
    kind: "search" | "filters" | "chip" | "first-run";
    title: string;
    note: string;
    action:
        | "clear-search"
        | "clear-filters"
        | "show-all"
        | "add-product"
        | "new-collection"
        | null;
}

/**
 * The design's empty states: a search that found nothing names the search
 * and offers Clear search; filters that found nothing offer to clear them;
 * an empty chip says what would fill it; and only an empty catalogue says
 * "No products yet". The Collections chip says "No collections yet" only
 * when the business has none (`collections` is how many it has; null when
 * they couldn't be read) — with some, it is their products that are missing.
 */
export function emptyCopy(
    query: ListQuery,
    storeName: string | null,
    collections: number | null = 0,
): EmptyCopy {
    if (query.q) {
        return {
            kind: "search",
            title: `No products match “${query.q}”`,
            note: "Search covers product names and SKUs. Clear it to see everything in this view.",
            action: "clear-search",
        };
    }
    if (query.status || query.category || query.collection) {
        return {
            kind: "filters",
            title: "No products match these filters",
            note: "Clear the filters to see everything in this view.",
            action: "clear-filters",
        };
    }
    if (query.view === "collections") {
        if (collections === 0) {
            return {
                kind: "chip",
                title: "No collections yet",
                note: "Collections group products into the sets people browse: Bread, Gifts, new arrivals.",
                action: "new-collection",
            };
        }
        return {
            kind: "chip",
            title: "Nothing in a collection yet",
            note:
                collections === null
                    ? "Products in a collection show here."
                    : "Your collections have nothing on sale in them yet. Edit one to pick its products, or point it at a category.",
            action: null,
        };
    }
    if (query.view === "inventory") {
        return {
            kind: "chip",
            title: "Nothing tracked yet",
            // Tracking is switched on in a product's editor, not made: no
            // New product here, which would answer a different question.
            note: "Turn on Track stock in a product's editor and its stock level shows here.",
            action: null,
        };
    }
    if (query.view === "needs") {
        return {
            kind: "chip",
            title: "Nothing needs restocking",
            note: "Every product that counts stock has enough to sell.",
            action: "show-all",
        };
    }
    return {
        kind: "first-run",
        title: "No products yet",
        note: `Add your first product and it appears in ${storeName ?? "your location"} straight away.`,
        action: "add-product",
    };
}

/** Whether anything beyond the chip narrows the list (for the empty state). */
export function isNarrowed(query: ListQuery): boolean {
    return (
        query.q.length > 0 ||
        query.status !== null ||
        query.category !== null ||
        query.option !== null ||
        query.collection !== null
    );
}
