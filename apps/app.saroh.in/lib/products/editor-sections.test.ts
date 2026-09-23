import { describe, expect, it } from "vitest";

import {
    basicsProblem,
    basicsSchema,
    descriptionPatch,
    isEmptyHtml,
    madeBySchema,
    partitionSections,
    savedMessage,
    saveHint,
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
            showMadeIn: true,
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
            descriptionPatch({
                description: "<p></p>",
                keyPoints: "a\n\nb",
                showKeyPoints: false,
            }),
        ).toEqual({
            description: null,
            keyPoints: ["a", "b"],
            // Only its own switch; the API merges it into the rest.
            shopFields: { keyPoints: false },
        });
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

describe("the editor's header and Save all", () => {
    it("says what is saved, what is not, and what needs a fix", () => {
        expect(saveHint([], [])).toBe("All changes saved");
        expect(saveHint(["basics"], [])).toBe("Basics is unsaved");
        expect(saveHint(["basics", "stock"], [])).toBe("2 sections unsaved");
        expect(saveHint(["basics", "stock"], ["stock"])).toBe(
            "2 sections unsaved · Stock needs a fix",
        );
        expect(
            saveHint(["basics", "stock", "photos"], ["basics", "stock"]),
        ).toBe("3 sections unsaved · Basics and Stock need a fix");
    });

    it("saves the sections that can, in page order, and leaves the rest", () => {
        expect(
            partitionSections(["stock", "basics", "description"], {
                description: "Too long",
            }),
        ).toEqual({ savable: ["basics", "stock"], stuck: ["description"] });
        expect(savedMessage(["basics"], [])).toBe("Basics saved.");
        expect(savedMessage(["basics", "stock"], ["description"])).toBe(
            "Saved basics, stock. Description needs a fix first.",
        );
    });

    it("names the first thing Basics must fix", () => {
        const ok = {
            name: "Serum",
            slug: "serum",
            price: "799",
            mrp: "",
            categoryId: "",
        };
        expect(basicsProblem(ok, false)).toBe("");
        expect(basicsProblem({ ...ok, name: " " }, false)).toBe(
            "Add a name first.",
        );
        expect(basicsProblem({ ...ok, slug: "Bad Slug" }, false)).toBe(
            "Fix the address first.",
        );
        // Creating makes the address from the name; it is never the problem.
        expect(basicsProblem({ ...ok, slug: "" }, true)).toBe("");
        expect(basicsProblem({ ...ok, price: "" }, false)).toBe(
            "Add a price first.",
        );
        expect(basicsProblem({ ...ok, mrp: "500" }, false)).toBe(
            "MRP can't be lower than the price it sells for.",
        );
    });
});
