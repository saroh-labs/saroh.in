import { describe, expect, it } from "vitest";

import {
    catalogueFilter,
    emptyCopy,
    isNarrowed,
    listHref,
    newCollectionHref,
    pageHref,
    readListQuery,
} from "./list-query";

describe("the Products list's address (#519)", () => {
    it("reads the chip, search, storefront and filters", () => {
        const query = readListQuery({
            view: "inventory",
            q: " loaf ",
            storefront: "online",
            status: "DRAFT",
            collection: "c1",
        });
        expect(query).toEqual({
            view: "inventory",
            q: "loaf",
            storefront: "online",
            status: "DRAFT",
            category: null,
            collection: "c1",
            page: 1,
            size: 50,
        });
        expect(isNarrowed(query)).toBe(true);
    });

    it("reads the page and the rows a page, and opens at the size last chosen", () => {
        expect(readListQuery({ page: "3", size: "25" })).toMatchObject({
            page: 3,
            size: 25,
        });
        // No size in the address: what this browser last chose.
        expect(readListQuery({}, 100).size).toBe(100);
        expect(readListQuery({ size: "10" }, 100).size).toBe(10);
        // Anything else is the first page, at the size it would have had.
        for (const page of ["0", "-2", "1.5", "two"]) {
            expect(readListQuery({ page }).page).toBe(1);
        }
        expect(readListQuery({ size: "37" }).size).toBe(50);
        expect(readListQuery({ size: "37" }, 25).size).toBe(25);
    });

    it("keeps the page and the size in the address, leaving the defaults out", () => {
        const query = readListQuery({ q: "rye", page: "3", size: "25" });
        expect(listHref(query)).toBe("/commerce/products?q=rye&page=3&size=25");
        expect(pageHref(query, 4)).toBe(
            "/commerce/products?q=rye&page=4&size=25",
        );
        expect(pageHref(query, 1)).toBe("/commerce/products?q=rye&size=25");
        expect(pageHref(readListQuery({ page: "2" }), 1)).toBe(
            "/commerce/products",
        );
    });

    it("starts again at the first page when what is listed, or the size, changes", () => {
        const query = readListQuery({ page: "3", size: "25" });
        expect(listHref(query, { view: "inventory" })).toBe(
            "/commerce/products?tab=inventory&size=25",
        );
        expect(listHref(query, { view: "needs" })).toBe(
            "/commerce/products?view=needs&size=25",
        );
        expect(listHref(query, { q: "rye" })).toBe(
            "/commerce/products?q=rye&size=25",
        );
        expect(listHref(query, { status: "DRAFT" })).toBe(
            "/commerce/products?status=DRAFT&size=25",
        );
        expect(listHref(query, { collection: "c1" })).toBe(
            "/commerce/products?collection=c1&size=25",
        );
        expect(listHref(query, { size: 100 })).toBe(
            "/commerce/products?size=100",
        );
        expect(listHref(query, { size: 50 })).toBe("/commerce/products");
    });

    it("falls back to All for an unknown chip and ignores an unknown status", () => {
        const query = readListQuery({ view: "nope", status: "PAUSED" });
        expect(query.view).toBe("all");
        expect(query.status).toBeNull();
        expect(isNarrowed(query)).toBe(false);
    });

    it("reads the old Needs restock chip as Show only these", () => {
        expect(readListQuery({ view: "restock" }).view).toBe("needs");
    });

    it("writes only what differs from the default", () => {
        const query = readListQuery({});
        expect(listHref(query)).toBe("/commerce/products");
        expect(listHref(query, { view: "collections", q: "rye" })).toBe(
            "/commerce/products?tab=collections&q=rye",
        );
    });

    it("names the search that found nothing, and offers Clear search", () => {
        expect(emptyCopy(readListQuery({ q: "zzz" }), null)).toMatchObject({
            title: "No products match “zzz”",
            action: "clear-search",
        });
    });

    it("says No products yet only for an empty catalogue", () => {
        expect(emptyCopy(readListQuery({}), "Hill Road")).toMatchObject({
            kind: "first-run",
            title: "No products yet",
            note: "Add your first product and it appears in Hill Road straight away.",
        });
        expect(emptyCopy(readListQuery({ status: "DRAFT" }), null).kind).toBe(
            "filters",
        );
        expect(emptyCopy(readListQuery({ view: "needs" }), null).title).toBe(
            "Nothing needs restocking",
        );
    });

    it("says No collections yet, with New collection, only when there are none", () => {
        const onChip = readListQuery({ view: "collections" });
        expect(emptyCopy(onChip, null, 0)).toMatchObject({
            title: "No collections yet",
            action: "new-collection",
        });
        expect(emptyCopy(onChip, null, 3)).toMatchObject({
            title: "Nothing in a collection yet",
            action: null,
        });
        // Couldn't be read: never "No collections yet".
        expect(emptyCopy(onChip, null, null).title).toBe(
            "Nothing in a collection yet",
        );
    });

    it("links New collection to the Collections chip with the sheet open", () => {
        expect(newCollectionHref(readListQuery({}))).toBe(
            "/commerce/products?tab=collections&new=collection",
        );
        expect(
            newCollectionHref(readListQuery({ q: "rye", collection: "c1" })),
        ).toBe("/commerce/products?tab=collections&q=rye&new=collection");
    });

    it("asks the API only for what narrows", () => {
        expect(catalogueFilter(readListQuery({ q: "rye" }))).toEqual({
            view: undefined,
            q: "rye",
            storefront: undefined,
            status: undefined,
            category: undefined,
            collection: undefined,
            page: undefined,
            size: 50,
        });
    });

    it("asks the API for the page by its number, at the size on screen", () => {
        expect(
            catalogueFilter(readListQuery({ page: "3", size: "25" })),
        ).toMatchObject({ page: 3, size: 25 });
        expect(catalogueFilter(readListQuery({}, 10))).toMatchObject({
            page: undefined,
            size: 10,
        });
    });
});
