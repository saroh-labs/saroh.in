import { DEFAULT_PAGE_SIZE, readPageSize } from "@saroh/ui/lib/paging";

/**
 * The Stock screen's address (#527): its tab, each tab's filters, and each
 * tab's page. Pure, with no client mark: the page reads an address with it
 * on the server and the screen builds its links with it in the browser.
 *
 * The three lists page on their own, so each keeps its page number and its
 * rows per page under its own names: someone on page 3 of Levels who looks
 * at Checks comes back to page 3. A size is in the address only when it
 * isn't 50; an address with none opens at what this browser last chose.
 */

export const STOCK_TABS = ["levels", "log", "checks"] as const;
export type StockTab = (typeof STOCK_TABS)[number];

/** Each list's name for the rows per page a browser remembers. */
export const STOCK_LISTS: Record<StockTab, string> = {
    levels: "stock-levels",
    log: "stock-log",
    checks: "stock-checks",
};

/** The footer's accessible name on each tab. */
export const STOCK_PAGES_LABEL: Record<StockTab, string> = {
    levels: "Pages of stock levels",
    log: "Pages of stock changes",
    checks: "Pages of stock checks",
};

/** What each tab's page number and size are called in the address. */
const PAGE_KEYS: Record<StockTab, { page: string; size: string }> = {
    levels: { page: "page", size: "size" },
    log: { page: "logPage", size: "logSize" },
    checks: { page: "checksPage", size: "checksSize" },
};

/** The parts whose change lists something else on a tab: back to page 1. */
const RELISTING: Record<StockTab, readonly string[]> = {
    levels: ["show", "q"],
    log: ["kind", "store", "product"],
    checks: [],
};

export interface StockListPage {
    /** The page on screen, from 1. */
    page: number;
    /** Rows a page: 10, 25, 50 or 100. */
    size: number;
}

export type StockPages = Record<StockTab, StockListPage>;

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | undefined {
    const raw = params[key];
    return typeof raw === "string" ? raw : undefined;
}

/**
 * Each tab's page and size off the address. A page that isn't a whole
 * number from 1 is the first; a tab with no size opens at `remembered`,
 * what this browser last chose for it.
 */
export function readStockPages(
    params: Params,
    remembered: Partial<Record<StockTab, number>> = {},
): StockPages {
    const read = (tab: StockTab): StockListPage => {
        const page = Number(one(params, PAGE_KEYS[tab].page));
        return {
            page: Number.isInteger(page) && page >= 1 ? page : 1,
            size: readPageSize(
                one(params, PAGE_KEYS[tab].size),
                remembered[tab] ?? DEFAULT_PAGE_SIZE,
            ),
        };
    };
    return { levels: read("levels"), log: read("log"), checks: read("checks") };
}

/** Where the screen is: what its address says, defaults filled in. */
export interface StockAddress {
    tab: StockTab;
    /** Levels: "all", "needs" or a storefront's id. */
    show: string;
    /** Levels: the search. */
    q: string;
    /** Log: the kind of change, "all" for every one. */
    kind: string;
    /** Log: a storefront's id, "all" for every one. */
    store: string;
    /** Log: a product's id, or "". */
    product: string;
    pages: StockPages;
}

/**
 * A change to the address. A part set to `undefined` goes back to its
 * default. `page` and `size` are the tab on screen's.
 */
export interface StockChange {
    tab?: string;
    show?: string;
    q?: string;
    kind?: string;
    store?: string;
    product?: string;
    page?: number;
    size?: number;
}

/** The screen's address with some of its parts changed. */
export type StockHref = (change: StockChange) => string;

/**
 * The screen at `at` with `change` applied; defaults leave the address.
 * Changing what a tab lists (its search, a filter, its rows per page)
 * starts that tab again at page 1, because page 3 of another list is not
 * the page someone was on. Another tab's page is left where it was.
 */
export function stockHref(at: StockAddress, change: StockChange = {}): string {
    const { page, size, ...parts } = change;
    const pages: StockPages = {
        levels: { ...at.pages.levels },
        log: { ...at.pages.log },
        checks: { ...at.pages.checks },
    };
    for (const tab of STOCK_TABS) {
        if (RELISTING[tab].some((key) => key in parts)) pages[tab].page = 1;
    }
    if (size !== undefined) pages[at.tab] = { page: 1, size };
    if (page !== undefined) pages[at.tab].page = page;

    const next: Record<string, string | undefined> = {
        tab: at.tab === "levels" ? undefined : at.tab,
        show: at.show === "all" ? undefined : at.show,
        q: at.q || undefined,
        kind: at.kind === "all" ? undefined : at.kind,
        store: at.store === "all" ? undefined : at.store,
        product: at.product || undefined,
        ...parts,
    };
    for (const tab of STOCK_TABS) {
        const keys = PAGE_KEYS[tab];
        next[keys.page] =
            pages[tab].page > 1 ? String(pages[tab].page) : undefined;
        next[keys.size] =
            pages[tab].size !== DEFAULT_PAGE_SIZE
                ? String(pages[tab].size)
                : undefined;
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
        if (value) params.set(key, value);
    }
    const s = params.toString();
    return s ? `/commerce/stock?${s}` : "/commerce/stock";
}
