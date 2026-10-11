import { describe, expect, it } from "vitest";

import type { StockAddress } from "./list-query";
import { readStockPages, stockHref } from "./list-query";

const FIRST = { page: 1, size: 50 };

function at(over: Partial<StockAddress> = {}): StockAddress {
    return {
        tab: "levels",
        show: "all",
        q: "",
        kind: "all",
        store: "all",
        product: "",
        pages: { levels: FIRST, log: FIRST, checks: FIRST },
        ...over,
    };
}

describe("readStockPages", () => {
    it("opens every list at page 1, 50 rows, when the address says nothing", () => {
        expect(readStockPages({})).toEqual({
            levels: FIRST,
            log: FIRST,
            checks: FIRST,
        });
    });

    it("reads each tab's page and size under its own names", () => {
        expect(
            readStockPages({
                page: "3",
                size: "25",
                logPage: "2",
                logSize: "100",
                checksPage: "4",
                checksSize: "10",
            }),
        ).toEqual({
            levels: { page: 3, size: 25 },
            log: { page: 2, size: 100 },
            checks: { page: 4, size: 10 },
        });
    });

    it("opens a tab with no size at what this browser last chose for it", () => {
        expect(
            readStockPages({ size: "100" }, { levels: 10, log: 25 }),
        ).toEqual({
            levels: { page: 1, size: 100 },
            log: { page: 1, size: 25 },
            checks: FIRST,
        });
    });

    it("reads a page or a size that isn't one as the first, the remembered", () => {
        expect(
            readStockPages(
                {
                    page: "0",
                    size: "20",
                    logPage: "two",
                    logSize: "",
                    checksPage: ["2", "3"],
                    checksSize: "1.5",
                },
                { levels: 25 },
            ),
        ).toEqual({
            levels: { page: 1, size: 25 },
            log: FIRST,
            checks: FIRST,
        });
    });
});

describe("stockHref", () => {
    it("leaves every default out of the address", () => {
        expect(stockHref(at())).toBe("/commerce/stock");
        expect(stockHref(at({ tab: "log" }))).toBe("/commerce/stock?tab=log");
    });

    it("goes to a page of the tab on screen, and leaves the others where they were", () => {
        const here = at({
            tab: "log",
            pages: {
                levels: { page: 3, size: 50 },
                log: { page: 1, size: 25 },
                checks: FIRST,
            },
        });
        expect(stockHref(here, { page: 4 })).toBe(
            "/commerce/stock?tab=log&page=3&logPage=4&logSize=25",
        );
        // Page 1 is the address without a page.
        expect(stockHref(here, { page: 1 })).toBe(
            "/commerce/stock?tab=log&page=3&logSize=25",
        );
    });

    it("starts again at page 1 when the rows per page change", () => {
        const here = at({
            pages: { levels: { page: 3, size: 50 }, log: FIRST, checks: FIRST },
        });
        expect(stockHref(here, { size: 10 })).toBe("/commerce/stock?size=10");
        // 50 is the size an address without one means.
        expect(
            stockHref(
                at({
                    pages: {
                        levels: { page: 2, size: 10 },
                        log: FIRST,
                        checks: FIRST,
                    },
                }),
                { size: 50 },
            ),
        ).toBe("/commerce/stock");
    });

    it("starts a list again at page 1 when its search or a filter changes, and only that list", () => {
        const here = at({
            pages: {
                levels: { page: 3, size: 25 },
                log: { page: 5, size: 50 },
                checks: { page: 2, size: 50 },
            },
        });
        expect(stockHref(here, { q: "rye" })).toBe(
            "/commerce/stock?q=rye&size=25&logPage=5&checksPage=2",
        );
        expect(stockHref(here, { show: "needs" })).toBe(
            "/commerce/stock?show=needs&size=25&logPage=5&checksPage=2",
        );
        expect(stockHref(here, { show: undefined })).toBe(
            "/commerce/stock?size=25&logPage=5&checksPage=2",
        );
        expect(stockHref({ ...here, tab: "log" }, { kind: "wasted" })).toBe(
            "/commerce/stock?tab=log&kind=wasted&page=3&size=25&checksPage=2",
        );
        expect(
            stockHref(
                { ...here, tab: "log", store: "s1" },
                { store: undefined, product: "p1" },
            ),
        ).toBe(
            "/commerce/stock?tab=log&product=p1&page=3&size=25&checksPage=2",
        );
    });

    it("keeps each list's page across a change of tab", () => {
        const here = at({
            q: "rye",
            pages: {
                levels: { page: 3, size: 50 },
                log: FIRST,
                checks: FIRST,
            },
        });
        expect(stockHref(here, { tab: "checks" })).toBe(
            "/commerce/stock?tab=checks&q=rye&page=3",
        );
        expect(stockHref({ ...here, tab: "checks" }, { tab: undefined })).toBe(
            "/commerce/stock?q=rye&page=3",
        );
    });
});
