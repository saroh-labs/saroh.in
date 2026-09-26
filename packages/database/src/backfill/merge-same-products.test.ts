import { describe, expect, it } from "vitest";

import type { Candidate } from "./merge-same-products";
import { clusters, noticeText, whyApart } from "./merge-same-products";

const m = (s: string) => ({ toFixed: (d: number) => Number(s).toFixed(d) });

function product(over: Partial<Candidate> & { id: string }): Candidate {
    return {
        name: "Linen shirt",
        slug: over.id,
        createdAt: new Date(Date.UTC(2026, 0, 1)),
        status: "PUBLISHED",
        optionId: "size",
        categoryId: "tops",
        currency: "INR",
        price: m("1200"),
        mrp: m("1500"),
        gstRate: m("5"),
        hsnCode: "6205",
        variants: [
            { id: `${over.id}-s`, sku: "LS-S", price: null, mrp: null },
            { id: `${over.id}-m`, sku: "LS-M", price: m("1300"), mrp: null },
        ],
        stockLevels: [{ variantId: `${over.id}-s` }],
        stockTracked: true,
        ...over,
    };
}

describe("the clearly-the-same rule (#530)", () => {
    const a = product({ id: "a" });

    it("finds two products that match on every count the same", () => {
        expect(whyApart(a, product({ id: "b", slug: "linen-2" }))).toBeNull();
        // A price written out on the variant equals the product's.
        const b = product({ id: "b" });
        b.variants[0].price = m("1200.00");
        expect(whyApart(a, b)).toBeNull();
    });

    it("never joins products without variants", () => {
        expect(
            whyApart(product({ id: "x", variants: [], stockLevels: [] }), {
                ...product({ id: "y", variants: [], stockLevels: [] }),
            }),
        ).toBe("no-variants");
    });

    it("says the first rule a pair fails", () => {
        expect(whyApart(a, product({ id: "b", optionId: "shade" }))).toBe(
            "different-option",
        );
        const other = product({ id: "b" });
        other.variants[1].sku = "LS-L";
        expect(whyApart(a, other)).toBe("different-variants");
        const dearer = product({ id: "b" });
        dearer.variants[1].price = m("1350");
        expect(whyApart(a, dearer)).toBe("different-prices");
        const mrp = product({ id: "b" });
        mrp.variants[0].mrp = m("1600");
        expect(whyApart(a, mrp)).toBe("different-prices");
        expect(whyApart(a, product({ id: "b", hsnCode: "6206" }))).toBe(
            "different-tax",
        );
        expect(whyApart(a, product({ id: "b", gstRate: m("12") }))).toBe(
            "different-tax",
        );
        expect(whyApart(a, product({ id: "b", stockLevels: [] }))).toBe(
            "different-tracking",
        );
        expect(
            whyApart(
                a,
                product({ id: "b", stockLevels: [{ variantId: null }] }),
            ),
        ).toBe("different-tracking");
        // Track stock off keeps its shelves, at 0: it counts nothing (#515).
        expect(whyApart(a, product({ id: "b", stockTracked: false }))).toBe(
            "different-tracking",
        );
        expect(whyApart(a, product({ id: "b", status: "ARCHIVED" }))).toBe(
            "different-status",
        );
    });

    it("groups the same, oldest first", () => {
        const newer = product({
            id: "b",
            createdAt: new Date(Date.UTC(2026, 1, 1)),
        });
        const older = product({
            id: "c",
            createdAt: new Date(Date.UTC(2025, 1, 1)),
        });
        const apart = product({ id: "d", hsnCode: "6206" });
        expect(
            clusters([newer, apart, older]).map((c) => c.map((p) => p.id)),
        ).toEqual([["c", "b"], ["d"]]);
    });
});

describe("the merge notice", () => {
    it("says what joined, what stayed apart and what was dropped", () => {
        const text = noticeText({
            organizationId: "org",
            merged: [
                {
                    name: "Linen shirt",
                    productId: "a",
                    slug: "linen-shirt",
                    from: [{ productId: "b", slug: "linen-shirt-2" }],
                },
            ],
            keptApart: [
                {
                    name: "Tote",
                    productId: "t2",
                    apartFrom: "t1",
                    reason: "different-prices",
                },
            ],
            discarded: [
                {
                    productId: "a",
                    from: "b",
                    what: "address",
                    value: "linen-shirt-2",
                },
            ],
        });
        expect(text.title).toBe(
            "2 products made at more than one storefront are now 1 product",
        );
        expect(text.body).toContain("Linen shirt: each is now one product");
        expect(text.body).toContain("Tote share a name");
        expect(text.body).not.toContain("detail that differed");
        expect(text.body).toContain(
            "Links to 1 old product address no longer open: linen-shirt-2.",
        );
    });
});
