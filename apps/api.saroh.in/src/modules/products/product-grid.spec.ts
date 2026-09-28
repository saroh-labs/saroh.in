import { BadRequestException } from "@nestjs/common";

import { inGridOrder, parseGridQuery } from "./product-grid";

/** G12 — what a Product grid asks the public catalogue, and in what order. */
describe("parseGridQuery", () => {
    it("is no question at all without a source: /shop's whole list", () => {
        expect(parseGridQuery({})).toBeNull();
    });

    it("asks for the newest four when nothing else is said", () => {
        expect(parseGridQuery({ source: "newest" })).toEqual({
            source: "newest",
            collectionId: null,
            productIds: [],
            count: 4,
        });
    });

    it("reads a collection and a count", () => {
        expect(
            parseGridQuery({
                source: "collection",
                collection: "col_breads",
                count: "8",
            }),
        ).toEqual({
            source: "collection",
            collectionId: "col_breads",
            productIds: [],
            count: 8,
        });
    });

    it("reads picked products in order, once each", () => {
        expect(
            parseGridQuery({ source: "picked", ids: "p_3,p_1,p_3,p_2" }),
        ).toEqual({
            source: "picked",
            collectionId: null,
            productIds: ["p_3", "p_1", "p_2"],
            count: 4,
        });
    });

    it("keeps only what its source uses", () => {
        expect(
            parseGridQuery({
                source: "newest",
                collection: "col_breads",
                ids: "p_1",
            }),
        ).toEqual({
            source: "newest",
            collectionId: null,
            productIds: [],
            count: 4,
        });
    });

    it("asks a collection grid with none chosen for nothing", () => {
        expect(parseGridQuery({ source: "collection" })?.collectionId).toBe(
            null,
        );
    });

    it.each([
        [{ source: "random" }],
        [{ source: "newest", count: "0" }],
        [{ source: "newest", count: "13" }],
        [{ source: "newest", count: "4.5" }],
        [{ source: "newest", count: ["4", "8"] }],
        [{ source: "collection", collection: "col breads" }],
        [{ source: "picked", ids: "p_1,<script>" }],
        [
            {
                source: "picked",
                ids: Array.from({ length: 13 }, (_, i) => `p_${i}`).join(","),
            },
        ],
        [{ count: "4" }],
    ])("refuses %j", (raw) => {
        expect(() => parseGridQuery(raw)).toThrow(BadRequestException);
    });
});

describe("inGridOrder", () => {
    const row = (id: string) => ({ product: { id } });

    it("follows the order asked, not the order read", () => {
        const got = inGridOrder(
            ["p_3", "p_1", "p_2"],
            [row("p_1"), row("p_2"), row("p_3")],
            4,
        );
        expect(got.map((r) => r.product.id)).toEqual(["p_3", "p_1", "p_2"]);
    });

    it("skips one no longer sold here, and the next moves up", () => {
        const got = inGridOrder(
            ["p_gone", "p_1", "p_2", "p_3"],
            [row("p_1"), row("p_2"), row("p_3")],
            2,
        );
        expect(got.map((r) => r.product.id)).toEqual(["p_1", "p_2"]);
    });

    it("is empty when none of them is sold here", () => {
        expect(inGridOrder(["p_a", "p_b"], [row("p_1")], 4)).toEqual([]);
    });
});
