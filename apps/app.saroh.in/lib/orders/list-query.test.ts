import { describe, expect, it } from "vitest";

import { NO_FILTERS } from "@/lib/orders/list-filters";

import {
    exportParams,
    orderListParams,
    ordersEmptyCopy,
    ordersHref,
    pageCount,
    pageHref,
    pageRange,
    readOrdersQuery,
    viewTotal,
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
            sort: null,
            older: false,
        });
    });

    it("reads an unknown tab as the view the list opens on", () => {
        expect(readOrdersQuery({ tab: "abandoned" }).tab).toBe("open");
    });

    it("opens on Open, soonest late first, with month-old ones folded (DEC-265)", () => {
        expect(first.tab).toBe("open");
        expect(orderListParams(first)).toMatchObject({
            tab: "open",
            sort: "due",
            older: "hide",
        });
        expect(ordersHref(first)).toBe("/commerce/orders");
        // All is written, since it isn't what the bare address opens on.
        expect(ordersHref(first, { tab: "all" })).toBe(
            "/commerce/orders?tab=all",
        );
        expect(orderListParams(readOrdersQuery({ tab: "all" }))).toMatchObject({
            tab: undefined,
            sort: undefined,
            older: undefined,
        });
    });

    it("keeps a link that narrows the list about every order, as it always was", () => {
        expect(readOrdersQuery({ payment: "paid", date: "7d" }).tab).toBe(
            "all",
        );
        expect(readOrdersQuery({ q: "priya" }).tab).toBe("all");
        // A search typed on Open stays on Open, and says so.
        expect(ordersHref(first, { q: "priya" })).toBe(
            "/commerce/orders?tab=open&q=priya",
        );
        // A search finds the month-old ones too: nothing is folded.
        expect(
            orderListParams(readOrdersQuery({ tab: "open", q: "priya" })).older,
        ).toBeUndefined();
    });

    it("reads a chosen sort and the month-old list, and writes them back", () => {
        const q = readOrdersQuery({ sort: "placed", older: "1" });
        expect(q).toMatchObject({ tab: "open", sort: "placed", older: true });
        expect(orderListParams(q)).toMatchObject({
            sort: undefined,
            older: "only",
        });
        expect(ordersHref(q)).toBe("/commerce/orders?sort=placed&older=1");
        expect(readOrdersQuery({ sort: "sideways" }).sort).toBeNull();
    });

    it("exports the view newest first, as the cursor walks it", () => {
        const params = exportParams(readOrdersQuery({ page: "3" }));
        expect(params).toMatchObject({
            tab: "open",
            older: "hide",
            page: undefined,
        });
        expect(params.sort).toBeUndefined();
    });

    it("pages through what the view holds: Open less the folded ones", () => {
        const counts = { all: 40, open: 20, refunded: 2, stale: 12 };
        expect(viewTotal(first, counts)).toBe(8);
        expect(viewTotal(readOrdersQuery({ older: "1" }), counts)).toBe(12);
        expect(viewTotal(readOrdersQuery({ tab: "all" }), counts)).toBe(40);
        expect(viewTotal(first, { all: 1, open: 1, refunded: 0 })).toBe(1);
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
        // Open is what the bare address opens on: nothing to write.
        expect(ordersHref(q, { since: null })).toBe("/commerce/orders");
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
        expect(orderListParams(readOrdersQuery({ tab: "all" }))).toEqual({
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
            sort: "due",
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

    it("offers every order when a search in a view found nothing", () => {
        const copy = ordersEmptyCopy(
            readOrdersQuery({ tab: "open", q: "zzz" }),
            null,
        );
        expect(copy.action).toBe("show-all");
        expect(copy.note).toContain("phone numbers, products");
    });

    it("says the month-old list is empty, with the way back", () => {
        expect(
            ordersEmptyCopy(readOrdersQuery({ older: "1" }), null, null, 9),
        ).toMatchObject({ kind: "older", action: "show-open" });
    });

    it("says No orders yet only for an empty business", () => {
        // Open, with orders elsewhere: nothing left to fulfil.
        expect(ordersEmptyCopy(first, "Hill Road", null, 3).kind).toBe("tab");
        expect(ordersEmptyCopy(first, "Hill Road", null, 0)).toMatchObject({
            title: "No orders yet",
            note: "Orders from your website and counter show here.",
            action: null,
        });
    });
});
