import { describe, expect, it } from "vitest";

import { NO_FILTERS } from "@/lib/orders/list-filters";

import {
    orderListParams,
    ordersEmptyCopy,
    ordersHref,
    pageCount,
    pageHref,
    pageRange,
    readOrdersQuery,
} from "@/lib/orders/list-query";

/** The Orders list's address (plan B, B3): tab, search, storefront, page. */

const first = readOrdersQuery({});

describe("readOrdersQuery", () => {
    it("reads the tab, the search and the storefront", () => {
        expect(
            readOrdersQuery({ tab: "open", q: " 1042 ", storefront: "s1" }),
        ).toEqual({
            tab: "open",
            q: "1042",
            storefront: "s1",
            since: null,
            ...NO_FILTERS,
            page: 1,
            size: 50,
        });
    });

    it("reads an unknown tab as All", () => {
        expect(readOrdersQuery({ tab: "abandoned" }).tab).toBe("all");
    });

    it("lands a link from before B3 on the tab it meant", () => {
        expect(readOrdersQuery({ view: "unfulfilled" }).tab).toBe("open");
        expect(readOrdersQuery({ view: "refunds" }).tab).toBe("refunded");
        expect(readOrdersQuery({ view: "cancelled" }).tab).toBe("all");
    });

    it("reads the page and the size, and anything else as the default", () => {
        expect(readOrdersQuery({ page: "3", size: "25" })).toMatchObject({
            page: 3,
            size: 25,
        });
        expect(readOrdersQuery({ page: "0", size: "37" })).toMatchObject({
            page: 1,
            size: 50,
        });
        // An address from before, carrying the API's cursor: the first page.
        expect(readOrdersQuery({ cursor: "c2", back: "c1" }).page).toBe(1);
    });
});

describe("since (Home's Last 24 hours, F6)", () => {
    const at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    it("carries the instant to the API and keeps it while paging", () => {
        const q = readOrdersQuery({ since: at, tab: "open" });
        expect(q.since).toBe(at);
        expect(orderListParams(q).since).toBe(at);
        expect(pageHref(q, 2)).toBe(
            `/commerce/orders?tab=open&since=${encodeURIComponent(at)}&page=2`,
        );
    });

    it("drops it, and the page, for Show all", () => {
        const q = readOrdersQuery({ since: at, page: "2", tab: "open" });
        expect(ordersHref(q, { since: null })).toBe(
            "/commerce/orders?tab=open",
        );
    });

    it("reads a malformed or future instant as no filter", () => {
        expect(readOrdersQuery({ since: "yesterday" }).since).toBeNull();
        const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        expect(readOrdersQuery({ since: future }).since).toBeNull();
    });

    it("says an empty window is empty, not that there are no orders", () => {
        expect(
            ordersEmptyCopy(readOrdersQuery({ since: at }), null),
        ).toMatchObject({
            kind: "since",
            title: "No orders in the last 24 hours",
            action: "clear-since",
        });
    });
});

describe("ordersHref", () => {
    it("leaves the defaults out of the address", () => {
        expect(ordersHref(first)).toBe("/commerce/orders");
        expect(ordersHref(first, { tab: "open", q: "priya" })).toBe(
            "/commerce/orders?tab=open&q=priya",
        );
    });

    it("starts again at the first page when what is listed changes", () => {
        const page3 = readOrdersQuery({ page: "3" });
        expect(ordersHref(page3, { tab: "refunded" })).toBe(
            "/commerce/orders?tab=refunded",
        );
        expect(ordersHref(page3, { storefront: "s1" })).toBe(
            "/commerce/orders?storefront=s1",
        );
        expect(ordersHref(page3, { q: "" })).toBe("/commerce/orders");
    });
});

describe("paging", () => {
    it("goes to any page by its number, and the first leaves the address", () => {
        expect(pageHref(first, 2)).toBe("/commerce/orders?page=2");
        const page3 = readOrdersQuery({ page: "3" });
        expect(pageHref(page3, 7)).toBe("/commerce/orders?page=7");
        expect(pageHref(page3, 1)).toBe("/commerce/orders");
    });

    it("keeps the size while paging, and another size starts at page one", () => {
        const small = readOrdersQuery({ size: "10", page: "4" });
        expect(pageHref(small, 5)).toBe("/commerce/orders?page=5&size=10");
        expect(ordersHref(small, { size: 100 })).toBe(
            "/commerce/orders?size=100",
        );
        expect(ordersHref(small, { size: 50 })).toBe("/commerce/orders");
        expect(pageCount(small, 312)).toBe(32);
        expect(pageCount(first, 312)).toBe(7);
    });

    it("keeps the tab and search while paging", () => {
        const open = readOrdersQuery({ tab: "open", q: "priya" });
        expect(pageHref(open, 2)).toBe(
            "/commerce/orders?tab=open&q=priya&page=2",
        );
    });

    it("says where the page sits in the tab's count", () => {
        expect(pageRange(first, 50, 312)).toBe("1 to 50 of 312");
        const page2 = readOrdersQuery({ page: "2" });
        expect(pageRange(page2, 50, 312)).toBe("51 to 100 of 312");
        const tens = readOrdersQuery({ page: "3", size: "10" });
        expect(pageRange(tens, 10, 312)).toBe("21 to 30 of 312");
        // One page says nothing: the tab's count already does.
        expect(pageRange(first, 12, 12)).toBeNull();
    });
});

describe("orderListParams", () => {
    it("asks the API only for what narrows the list", () => {
        expect(orderListParams(first)).toEqual({
            tab: undefined,
            q: undefined,
            storeId: undefined,
            since: undefined,
            page: undefined,
            size: undefined,
        });
        expect(
            orderListParams(
                readOrdersQuery({
                    tab: "open",
                    q: "1042",
                    storefront: "s1",
                    page: "2",
                    size: "25",
                }),
            ),
        ).toEqual({
            tab: "open",
            q: "1042",
            storeId: "s1",
            since: undefined,
            page: 2,
            size: 25,
        });
    });
});

describe("ordersEmptyCopy", () => {
    it("names a search that found nothing", () => {
        const copy = ordersEmptyCopy(readOrdersQuery({ q: "zzz" }), null);
        expect(copy.title).toBe("No orders match “zzz”");
        expect(copy.action).toBe("clear-search");
    });

    it("says what an empty tab would hold", () => {
        expect(
            ordersEmptyCopy(readOrdersQuery({ tab: "open" }), null),
        ).toMatchObject({
            title: "Nothing left to fulfil",
            action: "show-all",
        });
        expect(
            ordersEmptyCopy(readOrdersQuery({ tab: "refunded" }), null).title,
        ).toBe("No refunds");
    });

    it("says No orders yet only for an empty business", () => {
        expect(ordersEmptyCopy(first, "Hill Road")).toMatchObject({
            title: "No orders yet",
            note: "Orders from your website and counter show here.",
            action: null,
        });
    });
});
