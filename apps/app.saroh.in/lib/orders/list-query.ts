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

/**
 * Newest placed first, or by when each order turns late, soonest first
 * (DEC-265). Null in the address: the tab's own order (`ordersSort`).
 */
export type OrdersSort = "placed" | "due";

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
    /** The order chosen (`?sort=`); null for the tab's own (`ordersSort`). */
    sort: OrdersSort | null;
    /**
     * Only the open orders placed a month ago or more (`?older=1`), the
     * line the Open view folds them under, opened (DEC-265).
     */
    older: boolean;
}

type Params = Record<string, string | string[] | undefined>;

/**
 * The view an address that names none opens on (DEC-265, extending
 * DEC-163 from Home): the bare list opens on Open, what is still to do,
 * soonest late first. An address that narrows the list some other way (a
 * search, a filter, Home's "Last 24 hours", an Insights week) asks about
 * every order, as such links always have. An address naming a view wins.
 */
export function defaultOrdersTab(
    query: Pick<OrdersQuery, "q" | "since"> & OrdersFilters,
): OrdersTab {
    return query.q || query.since || filtersActive(query) ? "all" : "open";
}

export const ORDERS_SORTS: readonly { id: OrdersSort; label: string }[] = [
    { id: "due", label: "Due soonest first" },
    { id: "placed", label: "Newest first" },
];

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
    const narrowed = {
        q: one(params, "q") ?? "",
        // A malformed or future instant is no filter (`sinceParam`).
        since: sinceParam(params)?.toISOString() ?? null,
        ...readOrdersFilters(params),
    };
    return {
        tab:
            ORDERS_TABS.find((t) => t.id === tab)?.id ??
            (view ? LEGACY_VIEW[view] : undefined) ??
            defaultOrdersTab(narrowed),
        storefront: one(params, "storefront") ?? null,
        ...narrowed,
        page: Number.isInteger(page) && page >= 1 ? page : 1,
        size: readPageSize(one(params, "size"), remembered),
        sort:
            ORDERS_SORTS.find((s) => s.id === one(params, "sort"))?.id ?? null,
        older: one(params, "older") === "1",
    };
}

/** The order the rows come in: the one chosen, else the tab's own. */
export function ordersSort(
    query: Pick<OrdersQuery, "tab" | "sort">,
): OrdersSort {
    return query.sort ?? (query.tab === "open" ? "due" : "placed");
}

/**
 * Whether the open orders placed a month ago or more are folded under one
 * line (DEC-265): on the Open view, while nothing is searched (a search
 * finds them all) and their own list isn't the one open.
 */
export function foldsOlder(
    query: Pick<OrdersQuery, "tab" | "q" | "older">,
): boolean {
    return query.tab === "open" && !query.q && !query.older;
}

/**
 * How many rows the view holds, for the pages: the tab's count, less the
 * folded month-old ones, or only those when their list is open.
 */
export function viewTotal(
    query: Pick<OrdersQuery, "tab" | "q" | "older">,
    counts: { all: number; open: number; refunded: number; stale?: number },
): number {
    const stale = counts.stale ?? 0;
    if (query.older) return stale;
    if (foldsOlder(query)) return Math.max(0, counts.open - stale);
    return counts[query.tab];
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
    "sort",
    "older",
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
    if (next.tab !== defaultOrdersTab(next)) q.set("tab", next.tab);
    if (next.q) q.set("q", next.q);
    if (next.storefront) q.set("storefront", next.storefront);
    if (next.since) q.set("since", next.since);
    writeOrdersFilters(next, q);
    if (next.page > 1) q.set("page", String(next.page));
    if (next.size !== ORDERS_PAGE_SIZE) q.set("size", String(next.size));
    if (next.sort) q.set("sort", next.sort);
    if (next.older) q.set("older", "1");
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
        sort: ordersSort(query) === "due" ? "due" : undefined,
        older: query.older ? "only" : foldsOlder(query) ? "hide" : undefined,
    };
}

/**
 * What Export asks for every page of the view: from the top, at the list's
 * own size, newest first, since the cursor it walks follows when orders
 * were placed, never when they turn late (DEC-265, which pages by number).
 */
export function exportParams(query: OrdersQuery): OrderListParams {
    return {
        ...orderListParams({ ...query, page: 1, size: ORDERS_PAGE_SIZE }),
        sort: undefined,
    };
}

/** What an empty list says, and what fills it. */
export interface OrdersEmptyCopy {
    kind: "search" | "filter" | "tab" | "since" | "older" | "first-run";
    title: string;
    note: string;
    action:
        | "clear-search"
        | "clear-filters"
        | "show-all"
        | "clear-since"
        | "show-open"
        | null;
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
    /**
     * Every order the business has, when read: none at all is the first
     * run, whichever view the list opened on.
     */
    everything: number | null = null,
): OrdersEmptyCopy {
    if (query.q) {
        // Open by default (DEC-265): the order asked about may be done.
        const all = query.tab === "all";
        return {
            kind: "search",
            title: `No orders match “${query.q}”`,
            note: all
                ? "Search covers names, phone numbers, products and order numbers. Clear it to see every order."
                : "Search covers names, phone numbers, products and order numbers in this view. Search every order instead.",
            action: all ? "clear-search" : "show-all",
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
    if (query.older) {
        return {
            kind: "older",
            title: "No orders open over a month",
            note: "Every open order here was placed in the last month.",
            action: "show-open",
        };
    }
    if (everything === 0 && !query.since && query.tab === "open") {
        return firstRun();
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
    return firstRun();
}

function firstRun(): OrdersEmptyCopy {
    return {
        kind: "first-run",
        title: "No orders yet",
        note: "Orders from your website and counter show here.",
        action: null,
    };
}
