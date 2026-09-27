import { describe, expect, it } from "vitest";

import {
    nextPageHref,
    orderListParams,
    ordersEmptyCopy,
    ordersHref,
    pageNumber,
    pageRange,
    previousPageHref,
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
            cursor: null,
            back: [],
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

    it("reads the pages before this one only past the first", () => {
        expect(readOrdersQuery({ cursor: "c2", back: "c1" }).back).toEqual([
            "c1",
        ]);
        expect(readOrdersQuery({ back: "c1" }).back).toEqual([]);
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
        const page3 = readOrdersQuery({ cursor: "c2", back: "c1" });
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
    it("walks forward by the API's cursor and back again", () => {
        const two = nextPageHref(first, "c1");
        expect(two).toBe("/commerce/orders?cursor=c1");
        const page2 = readOrdersQuery({ cursor: "c1" });
        const three = nextPageHref(page2, "c2");
        expect(three).toBe("/commerce/orders?cursor=c2&back=c1");
        const page3 = readOrdersQuery({ cursor: "c2", back: "c1" });
        expect(pageNumber(page3)).toBe(3);
        expect(previousPageHref(page3)).toBe("/commerce/orders?cursor=c1");
        expect(previousPageHref(page2)).toBe("/commerce/orders");
        expect(previousPageHref(first)).toBeNull();
    });

    it("keeps the tab and search while paging", () => {
        const open = readOrdersQuery({ tab: "open", q: "priya" });
        expect(nextPageHref(open, "c1")).toBe(
            "/commerce/orders?tab=open&q=priya&cursor=c1",
        );
    });

    it("says where the page sits in the tab's count", () => {
        expect(pageRange(first, 50, 312, true)).toBe("1–50 of 312");
        const page2 = readOrdersQuery({ cursor: "c1" });
        expect(pageRange(page2, 50, 312, true)).toBe("51–100 of 312");
        // One page says nothing: the tab's count already does.
        expect(pageRange(first, 12, 12, false)).toBeNull();
    });
});

describe("orderListParams", () => {
    it("asks the API only for what narrows the list", () => {
        expect(orderListParams(first)).toEqual({
            tab: undefined,
            q: undefined,
            storeId: undefined,
            cursor: undefined,
        });
        expect(
            orderListParams(
                readOrdersQuery({
                    tab: "open",
                    q: "1042",
                    storefront: "s1",
                    cursor: "c1",
                }),
            ),
        ).toEqual({ tab: "open", q: "1042", storeId: "s1", cursor: "c1" });
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
            note: "The first order in Hill Road appears here the moment someone checks out.",
            action: null,
        });
    });
});
