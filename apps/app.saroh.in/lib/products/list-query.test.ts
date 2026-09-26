import { describe, expect, it } from "vitest";

import {
    catalogueFilter,
    emptyCopy,
    isNarrowed,
    listHref,
    newCollectionHref,
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
        });
        expect(isNarrowed(query)).toBe(true);
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
            "/commerce/products?view=collections&q=rye",
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
            "/commerce/products?view=collections&new=collection",
        );
        expect(
            newCollectionHref(readListQuery({ q: "rye", collection: "c1" })),
        ).toBe("/commerce/products?view=collections&q=rye&new=collection");
    });

    it("asks the API only for what narrows", () => {
        expect(catalogueFilter(readListQuery({ q: "rye" }))).toEqual({
            view: undefined,
            q: "rye",
            storefront: undefined,
            status: undefined,
            category: undefined,
            collection: undefined,
        });
    });
});
