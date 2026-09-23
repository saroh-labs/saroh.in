import { describe, expect, it } from "vitest";

import {
    basicsSchema,
    descriptionPatch,
    isEmptyHtml,
    madeBySchema,
    seoFallback,
    slugify,
    splitLines,
    suggestSku,
    trimMoney,
} from "./editor-sections";

describe("product editor sections", () => {
    it("makes an address from a name", () => {
        expect(slugify("Rosé Hydra Glow Serum")).toBe("rose-hydra-glow-serum");
        expect(slugify("Kurta & Palazzo Set")).toBe("kurta-and-palazzo-set");
        expect(slugify("  --  ")).toBe("");
        expect(slugify("a".repeat(200))).toHaveLength(150);
    });

    it("suggests a SKU from the product and the variant", () => {
        expect(suggestSku("Hydra Glow Serum", "50 ml")).toBe("HGS-50ML");
        expect(suggestSku("Linen Wrap Dress", "M")).toBe("LWD-M");
        expect(suggestSku("", "S")).toBe("SKU-S");
        expect(suggestSku("Beard Oil", "")).toBe("BO-");
    });

    it("checks money and keeps MRP at or above the price", () => {
        const ok = {
            name: "Serum",
            slug: "serum",
            price: "799",
            mrp: "999",
            categoryId: "",
        };
        expect(basicsSchema.safeParse(ok).success).toBe(true);
        expect(basicsSchema.safeParse({ ...ok, price: "7.999" }).success).toBe(
            false,
        );
        const low = basicsSchema.safeParse({ ...ok, mrp: "700" });
        expect(low.success).toBe(false);
        expect(low.error?.issues[0]?.path).toEqual(["mrp"]);
        expect(basicsSchema.safeParse({ ...ok, mrp: "" }).success).toBe(true);
        expect(
            basicsSchema.safeParse({ ...ok, slug: "Has Space" }).success,
        ).toBe(false);
    });

    it("asks who made it and for the own returns rule", () => {
        const base = {
            madeHere: true,
            maker: "",
            madeIn: "",
            supplierCode: "",
            warranty: "",
            returnsMode: "STOREFRONT" as const,
            returnsText: "",
            showMaker: true,
            showWarranty: true,
            showReturns: true,
        };
        expect(madeBySchema.safeParse(base).success).toBe(true);
        expect(
            madeBySchema.safeParse({ ...base, madeHere: false }).success,
        ).toBe(false);
        expect(
            madeBySchema.safeParse({ ...base, returnsMode: "OWN" }).success,
        ).toBe(false);
    });

    it("treats an emptied editor as no description, and key points as lines", () => {
        expect(isEmptyHtml("<p></p>")).toBe(true);
        expect(isEmptyHtml("<p> </p><p></p>")).toBe(true);
        expect(isEmptyHtml("<p>Soft glow</p>")).toBe(false);
        expect(splitLines(" Rose water \n\nHyaluronic acid\n")).toEqual([
            "Rose water",
            "Hyaluronic acid",
        ]);
        expect(
            descriptionPatch({ description: "<p></p>", keyPoints: "a\n\nb" }),
        ).toEqual({ description: null, keyPoints: ["a", "b"] });
    });

    it("says what SEO falls back to", () => {
        const long = `<p>${"Glow ".repeat(60)}</p>`;
        const fb = seoFallback({ name: "Rose Serum", description: long });
        expect(fb.title).toBe("Rose Serum");
        expect(fb.description.length).toBeLessThanOrEqual(160);
        expect(fb.description.endsWith("…")).toBe(true);
    });

    it("shows money the way a merchant types it", () => {
        expect(trimMoney("799.00")).toBe("799");
        expect(trimMoney("24.50")).toBe("24.50");
    });
});
