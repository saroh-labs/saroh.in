import { DEFAULT_PAGE_SIZE, pagesOf, readPageSize } from "@saroh/ui/lib/paging";

import { sinceParam } from "@/lib/views/since";

import type { OrderFilterOptions, OrderListParams } from "./business-service";
import type { OrdersFilters } from "./list-filters";
import {
    FILTER_KEYS,
    filterParams,
    filteredEmptyTitle,
    filtersActive,
    readOrdersFilters,
    writeOrdersFilters,
} from "./list-filters";

/**
 * The Orders list's address (plan B, B3, B4). The tab, the search, the
 * storefront, the filters and the page all live in the URL, so a narrowed
 * list is a link someone can share and the server reads it once to ask the
 * API for one page. Pure: the screen builds its links from it, and the page
 * its request. The filters' own rules are in `list-filters.ts`.
 *
 * Paging is by number: the address carries `page` (from 1) and `size`
 * (rows a page; 50 unless chosen), so the footer can offer any page. An
 * address from before, carrying the API's cursor, opens the first page.
 * Export still walks the cursor (`order-export.tsx`).
 */

export type OrdersTab = "all" | "open" | "refunded";

export interface OrdersQuery extends OrdersFilters {
    tab: OrdersTab;
    q: string;
    storefront: string | null;
    /**
     * Only orders placed from this instant on (ISO), from Home's "Last 24
     * hours" link (F6); null for every order. Answered by the API, so the
     * rows and the tab counts agree.
     */
    since: string | null;
    /** The page on screen, from 1. */
    page: number;
    /** Rows a page: 10, 25, 50 or 100. */
    size: number;
}

type Params = Record<string, string | string[] | undefined>;

export const ORDERS_TABS: readonly { id: OrdersTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "open", label: "Open" },
    { id: "refunded", label: "Refunded" },
];

/** Rows a page before anyone chooses (`ORDER_PAGE_SIZE` in the API). */
export const ORDERS_PAGE_SIZE = DEFAULT_PAGE_SIZE;

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

/**
 * What the address asks for. An unknown tab is All; an address with no
 * size opens at `remembered`, the size this browser last chose.
 */
export function readOrdersQuery(
    params: Params,
    remembered: number = ORDERS_PAGE_SIZE,
): OrdersQuery {
    const tab = one(params, "tab");
    const view = one(params, "view");
    const page = Number(one(params, "page"));
    return {
        tab:
            ORDERS_TABS.find((t) => t.id === tab)?.id ??
            (view ? LEGACY_VIEW[view] : undefined) ??
            "all",
        q: one(params, "q") ?? "",
        storefront: one(params, "storefront") ?? null,
        // A malformed or future instant is no filter (`sinceParam`).
        since: sinceParam(params)?.toISOString() ?? null,
        ...readOrdersFilters(params),
        page: Number.isInteger(page) && page >= 1 ? page : 1,
        size: readPageSize(one(params, "size"), remembered),
    };
}

/** Keys whose change lists something else, so the page number is void. */
const RELISTING: readonly (keyof OrdersQuery)[] = [
    "tab",
    "q",
    "storefront",
    "since",
    ...FILTER_KEYS,
    // Another size cuts the list into other pages.
    "size",
];

/**
 * The list at `query` with `patch` applied; defaults leave the URL. Changing
 * what is listed (the tab, the search, the storefront, a filter) starts
 * again at the first page, because page 3 of another list is somebody
 * else's page 3.
 */
export function ordersHref(
    query: OrdersQuery,
    patch: Partial<OrdersQuery> = {},
): string {
    const relists = RELISTING.some((key) => key in patch);
    const next: OrdersQuery = {
        ...query,
        ...(relists ? { page: 1 } : {}),
        ...patch,
    };
    const q = new URLSearchParams();
    if (next.tab !== "all") q.set("tab", next.tab);
    if (next.q) q.set("q", next.q);
    if (next.storefront) q.set("storefront", next.storefront);
    if (next.since) q.set("since", next.since);
    writeOrdersFilters(next, q);
    if (next.page > 1) q.set("page", String(next.page));
    if (next.size !== ORDERS_PAGE_SIZE) q.set("size", String(next.size));
    const s = q.toString();
    return s ? `/commerce/orders?${s}` : "/commerce/orders";
}

/** The list at page `page`, everything else kept. */
export function pageHref(query: OrdersQuery, page: number): string {
    return ordersHref(query, { page });
}

/** How many pages the tab's `total` rows make at this size. */
export function pageCount(query: OrdersQuery, total: number): number {
    return pagesOf(total, query.size);
}

/**
 * "51 to 100 of 312": where the rows on screen sit in the tab's count.
 * Null when everything fits on one page, where the tab's count already
 * says it.
 */
export function pageRange(
    query: OrdersQuery,
    shown: number,
    total: number,
): string | null {
    if (shown === 0 || (query.page === 1 && total <= shown)) return null;
    const start = (query.page - 1) * query.size + 1;
    return `${start} to ${start + shown - 1} of ${total}`;
}

/** The API request for `query`, leaving out what it doesn't narrow. */
export function orderListParams(query: OrdersQuery): OrderListParams {
    return {
        tab: query.tab === "all" ? undefined : query.tab,
        q: query.q || undefined,
        storeId: query.storefront ?? undefined,
        since: query.since ?? undefined,
        ...filterParams(query),
        page: query.page > 1 ? query.page : undefined,
        size: query.size !== ORDERS_PAGE_SIZE ? query.size : undefined,
    };
}

/** What an empty list says, and what fills it. */
export interface OrdersEmptyCopy {
    kind: "search" | "filter" | "tab" | "since" | "first-run";
    title: string;
    note: string;
    action:
        "clear-search" | "clear-filters" | "show-all" | "clear-since" | null;
}

/**
 * The design's empty states: a search that found nothing names it and offers
 * Clear search; filters that found nothing say which ("No shipping orders in
 * the last 7 days") and offer Clear filters; an empty Open or Refunded tab
 * says what would land there; only an empty business says "No orders yet".
 * The failed and locked states are never empty lists (`orders-states.tsx`).
 */
export function ordersEmptyCopy(
    query: OrdersQuery,
    storeName: string | null,
    options: OrderFilterOptions | null = null,
): OrdersEmptyCopy {
    if (query.q) {
        return {
            kind: "search",
            title: `No orders match “${query.q}”`,
            note: "Search covers customer names and order numbers. Clear it to see everything in this view.",
            action: "clear-search",
        };
    }
    if (filtersActive(query)) {
        return {
            kind: "filter",
            title: filteredEmptyTitle(query, options),
            note: "Nothing in this view matches every filter. Clear them to see the whole list.",
            action: "clear-filters",
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
    if (query.since) {
        return {
            kind: "since",
            title: "No orders in the last 24 hours",
            note: "Orders placed since then land here. Every earlier order is still in the full list.",
            action: "clear-since",
        };
    }
    return {
        kind: "first-run",
        title: "No orders yet",
        note: "Orders from your website and counter show here.",
        action: null,
    };
}
