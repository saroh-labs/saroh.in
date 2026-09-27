import type { OrderListParams } from "./business-service";

/**
 * The Orders list's address (plan B, B3). The tab, the search, the
 * storefront and the page all live in the URL, so a narrowed list is a link
 * someone can share and the server reads it once to ask the API for one page.
 * Pure: the screen builds its links from it, and the page its request.
 *
 * Paging is by the API's cursor, which only goes forward. So the address
 * carries the cursor of the page on screen and `back`, the cursors of the
 * pages before it (the first page has none), and Previous pops one off.
 * B4 adds the filters here.
 */

export type OrdersTab = "all" | "open" | "refunded";

export interface OrdersQuery {
    tab: OrdersTab;
    q: string;
    storefront: string | null;
    /** Where the page on screen starts; null on the first page. */
    cursor: string | null;
    /** The cursors of the pages before this one, oldest first. */
    back: string[];
}

type Params = Record<string, string | string[] | undefined>;

export const ORDERS_TABS: readonly { id: OrdersTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "open", label: "Open" },
    { id: "refunded", label: "Refunded" },
];

/** How many rows the API puts on a page (`ORDER_PAGE_SIZE` there). */
export const ORDERS_PAGE_SIZE = 50;

/**
 * The tab ids the list used before B3 (`?view=`). A link carrying one still
 * lands on the tab it meant; Cancelled has no tab of its own now, so it lands
 * on All, where cancelled orders are.
 */
const LEGACY_VIEW: Record<string, OrdersTab> = {
    unfulfilled: "open",
    refunds: "refunded",
    cancelled: "all",
};

function one(params: Params, key: string): string | undefined {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value?.trim() ? value.trim() : undefined;
}

/** What the address asks for. An unknown tab is All. */
export function readOrdersQuery(params: Params): OrdersQuery {
    const tab = one(params, "tab");
    const view = one(params, "view");
    const cursor = one(params, "cursor") ?? null;
    return {
        tab:
            ORDERS_TABS.find((t) => t.id === tab)?.id ??
            (view ? LEGACY_VIEW[view] : undefined) ??
            "all",
        q: one(params, "q") ?? "",
        storefront: one(params, "storefront") ?? null,
        cursor,
        // Only meaningful past the first page.
        back: cursor
            ? (one(params, "back") ?? "").split(",").filter(Boolean)
            : [],
    };
}

/**
 * The list at `query` with `patch` applied; defaults leave the URL. Changing
 * what is listed (the tab, the search, the storefront) starts again at the
 * first page, because the old cursor points into a different list.
 */
export function ordersHref(
    query: OrdersQuery,
    patch: Partial<OrdersQuery> = {},
): string {
    const relists = "tab" in patch || "q" in patch || "storefront" in patch;
    const next: OrdersQuery = {
        ...query,
        ...(relists ? { cursor: null, back: [] } : {}),
        ...patch,
    };
    const q = new URLSearchParams();
    if (next.tab !== "all") q.set("tab", next.tab);
    if (next.q) q.set("q", next.q);
    if (next.storefront) q.set("storefront", next.storefront);
    if (next.cursor) {
        q.set("cursor", next.cursor);
        if (next.back.length) q.set("back", next.back.join(","));
    }
    const s = q.toString();
    return s ? `/commerce/orders?${s}` : "/commerce/orders";
}

/** The next page, from the API's `nextCursor`. */
export function nextPageHref(query: OrdersQuery, nextCursor: string): string {
    return ordersHref(query, {
        cursor: nextCursor,
        back: query.cursor ? [...query.back, query.cursor] : [],
    });
}

/** The page before this one; null on the first page. */
export function previousPageHref(query: OrdersQuery): string | null {
    if (!query.cursor) return null;
    const back = query.back.slice(0, -1);
    return ordersHref(query, { cursor: query.back.at(-1) ?? null, back });
}

/** Which page is on screen, from 1. */
export function pageNumber(query: OrdersQuery): number {
    return query.cursor ? query.back.length + 2 : 1;
}

/**
 * "51–100 of 312": where the rows on screen sit in the tab's count. Null
 * when everything fits on one page, where the tab's count already says it.
 */
export function pageRange(
    query: OrdersQuery,
    shown: number,
    total: number,
    more: boolean,
): string | null {
    if (!query.cursor && !more) return null;
    const start = (pageNumber(query) - 1) * ORDERS_PAGE_SIZE + 1;
    return shown === 0 ? null : `${start}–${start + shown - 1} of ${total}`;
}

/** The API request for `query`, leaving out what it doesn't narrow. */
export function orderListParams(query: OrdersQuery): OrderListParams {
    return {
        tab: query.tab === "all" ? undefined : query.tab,
        q: query.q || undefined,
        storeId: query.storefront ?? undefined,
        cursor: query.cursor ?? undefined,
    };
}

/** What an empty list says, and what fills it. */
export interface OrdersEmptyCopy {
    kind: "search" | "tab" | "first-run";
    title: string;
    note: string;
    action: "clear-search" | "show-all" | null;
}

/**
 * The design's empty states: a search that found nothing names it and offers
 * Clear search; an empty Open or Refunded tab says what would land there;
 * only an empty business says "No orders yet". (B7 adds the per-filter,
 * failed and locked states.)
 */
export function ordersEmptyCopy(
    query: OrdersQuery,
    storeName: string | null,
): OrdersEmptyCopy {
    if (query.q) {
        return {
            kind: "search",
            title: `No orders match “${query.q}”`,
            note: "Search covers customer names and order numbers. Clear it to see everything in this view.",
            action: "clear-search",
        };
    }
    if (query.tab === "open") {
        return {
            kind: "tab",
            title: "Nothing left to fulfil",
            note: "Every order here has been packed and sent. This is the view you want to find empty.",
            action: "show-all",
        };
    }
    if (query.tab === "refunded") {
        return {
            kind: "tab",
            title: "No refunds",
            note: "Refunded orders collect here so you can see them apart from the rest.",
            action: "show-all",
        };
    }
    return {
        kind: "first-run",
        title: "No orders yet",
        note: `The first order in ${storeName ?? "your storefronts"} appears here the moment someone checks out.`,
        action: null,
    };
}
