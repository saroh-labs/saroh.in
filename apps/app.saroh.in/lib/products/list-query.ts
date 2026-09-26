import type { CatalogueView, ProductStatus } from "./service";

/**
 * The Products list's address (#519). Everything that narrows it — the chip,
 * the search, the storefront, the status, a category or a collection —
 * lives in the URL, so a narrowed list is a link someone can share, and the
 * server reads it once to ask the API for the first page. Pure.
 */
export interface ListQuery {
    view: CatalogueView;
    q: string;
    storefront: string | null;
    status: ProductStatus | null;
    category: string | null;
    collection: string | null;
}

type Params = Record<string, string | string[] | undefined>;

const VIEWS: readonly CatalogueView[] = [
    "all",
    "collections",
    "inventory",
    "needs",
];
const STATUSES: readonly ProductStatus[] = ["PUBLISHED", "DRAFT", "ARCHIVED"];

function one(params: Params, key: string): string | undefined {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() ? value.trim() : undefined;
}

/**
 * What the address asks for. An unknown chip is "All"; the old "Needs
 * restock" chip (`?view=restock`) is "Show only these".
 */
export function readListQuery(params: Params): ListQuery {
    const view = one(params, "view");
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
        collection: one(params, "collection") ?? null,
    };
}

/** The list at `query` with `patch` applied; defaults leave the URL. */
export function listHref(
    query: ListQuery,
    patch: Partial<ListQuery> = {},
): string {
    const next = { ...query, ...patch };
    const q = new URLSearchParams();
    if (next.view !== "all") q.set("view", next.view);
    if (next.q) q.set("q", next.q);
    if (next.storefront) q.set("storefront", next.storefront);
    if (next.status) q.set("status", next.status);
    if (next.category) q.set("category", next.category);
    if (next.collection) q.set("collection", next.collection);
    const s = q.toString();
    return s ? `/commerce/products?${s}` : "/commerce/products";
}

/** The API filter for `query`, leaving out what it doesn't narrow. */
export function catalogueFilter(query: ListQuery) {
    return {
        view: query.view === "all" ? undefined : query.view,
        q: query.q || undefined,
        storefront: query.storefront ?? undefined,
        status: query.status ?? undefined,
        category: query.category ?? undefined,
        collection: query.collection ?? undefined,
    };
}

/** What an empty list says, and the one action that fills it. */
export interface EmptyCopy {
    kind: "search" | "filters" | "chip" | "first-run";
    title: string;
    note: string;
    action:
        "clear-search" | "clear-filters" | "show-all" | "add-product" | null;
}

/**
 * The design's empty states: a search that found nothing names the search
 * and offers Clear search; filters that found nothing offer to clear them;
 * an empty chip says what would fill it; and only an empty catalogue says
 * "No products yet".
 */
export function emptyCopy(
    query: ListQuery,
    storeName: string | null,
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
        return {
            kind: "chip",
            title: "No collections yet",
            note: "Collections group products into the sets people browse — Bread, Gifts, new arrivals.",
            action: null,
        };
    }
    if (query.view === "inventory") {
        return {
            kind: "chip",
            title: "Nothing tracked yet",
            note: "Turn on inventory tracking for a product and its stock level shows here.",
            action: "add-product",
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
        note: `Add your first product and it appears in ${storeName ?? "your storefront"} straight away.`,
        action: "add-product",
    };
}

/** Whether anything beyond the chip narrows the list (for the empty state). */
export function isNarrowed(query: ListQuery): boolean {
    return (
        query.q.length > 0 ||
        query.status !== null ||
        query.category !== null ||
        query.collection !== null
    );
}
