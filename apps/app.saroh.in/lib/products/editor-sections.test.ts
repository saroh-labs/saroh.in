import { describe, expect, it } from "vitest";

import type { StockDraft } from "./editor-sections";
import {
    basicsFrom,
    basicsPatch,
    basicsProblem,
    basicsSchema,
    descriptionPatch,
    detailsFrom,
    detailsPatch,
    isEmptyHtml,
    madeByFrom,
    madeByPatch,
    madeBySchema,
    mergeDraft,
    partitionSections,
    photosFrom,
    photosInput,
    samePhotos,
    savedMessage,
    saveHint,
    seoFallback,
    seoFrom,
    seoPatch,
    slugify,
    splitLines,
    trimMoney,
} from "./editor-sections";
import type { ProductDetail } from "./service";

describe("product editor sections", () => {
    it("makes an address from a name", () => {
        expect(slugify("Rosé Hydra Glow Serum")).toBe("rose-hydra-glow-serum");
        expect(slugify("Kurta & Palazzo Set")).toBe("kurta-and-palazzo-set");
        expect(slugify("  --  ")).toBe("");
        expect(slugify("a".repeat(200))).toHaveLength(150);
    });

    it("checks money and keeps MRP at or above the price", () => {
        const ok = {
            name: "Serum",
            slug: "serum",
            price: "799",
            mrp: "999",
            categoryId: "",
            gstRate: "",
            hsnCode: "",
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
            gstRate: "",
            hsnCode: "",
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

/** A saved product with only what the sections read filled in. */
function product(over: Partial<ProductDetail> = {}): ProductDetail {
    return {
        id: "p1",
        name: "Rose Hydra Serum",
        slug: "rose-hydra-serum",
        description: null,
        image: null,
        categoryId: "c1",
        price: "799.00",
        mrp: "999.50",
        currency: "INR",
        status: "DRAFT",
        variants: [],
        customFields: [],
        allergens: { contains: [], mayContain: [] },
        inventory: null,
        howToUse: "Two drops, morning and night.",
        materials: null,
        keyPoints: [],
        madeHere: false,
        maker: "Kumkumadi Labs",
        madeIn: "Pune",
        supplierCode: null,
        warranty: null,
        returnsMode: "OWN",
        returnsText: "Unopened, within 7 days.",
        shopFields: { materials: false, madeIn: false },
        seoTitle: null,
        seoDescription: "Rose water serum.",
        seoImageId: "img2",
        optionId: null,
        images: [],
        stockMode: "product",
        variantPromises: {},
        option: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        ...over,
    };
}

describe("each section's values and patch", () => {
    it("basics: money as typed, and blanks sent as none", () => {
        const values = basicsFrom(product());
        expect(values).toEqual({
            name: "Rose Hydra Serum",
            slug: "rose-hydra-serum",
            price: "799",
            mrp: "999.50",
            categoryId: "c1",
            gstRate: "",
            hsnCode: "",
        });
        expect(
            basicsPatch({
                ...values,
                name: "  Rose Serum ",
                mrp: " ",
                categoryId: "",
            }),
        ).toEqual({
            name: "Rose Serum",
            slug: "rose-hydra-serum",
            price: "799",
            mrp: null,
            categoryId: null,
            gstRate: null,
            hsnCode: null,
        });
        // GST (ADR-008): the rate as saved, the HSN as printed.
        expect(
            basicsFrom(product({ gstRate: "18.00", hsnCode: "19059010" })),
        ).toMatchObject({ gstRate: "18", hsnCode: "19059010" });
        expect(
            basicsPatch({ ...values, gstRate: "5", hsnCode: "2101 11 20" }),
        ).toMatchObject({ gstRate: "5", hsnCode: "21011120" });
        expect(
            basicsSchema.safeParse({ ...values, hsnCode: "12" }).success,
        ).toBe(false);
        expect(
            basicsFrom(product({ mrp: null, categoryId: null })),
        ).toMatchObject({ mrp: "", categoryId: "" });
    });

    it("details: a missing switch reads as shown, and only its own switches go", () => {
        const values = detailsFrom(product());
        expect(values).toEqual({
            howToUse: "Two drops, morning and night.",
            materials: "",
            showHowToUse: true,
            showMaterials: false,
        });
        expect(detailsPatch({ ...values, howToUse: "   " })).toEqual({
            howToUse: null,
            materials: null,
            shopFields: { howToUse: true, materials: false },
        });
    });

    it("made by: the maker and where are cleared when it is made here", () => {
        const values = madeByFrom(product());
        expect(values).toMatchObject({
            madeHere: false,
            maker: "Kumkumadi Labs",
            madeIn: "Pune",
            returnsMode: "OWN",
            returnsText: "Unopened, within 7 days.",
            showMadeIn: false,
            showMaker: true,
        });
        expect(madeByPatch(values)).toMatchObject({
            madeHere: false,
            maker: "Kumkumadi Labs",
            madeIn: "Pune",
            returnsText: "Unopened, within 7 days.",
        });
        expect(
            madeByPatch({
                ...values,
                madeHere: true,
                returnsMode: "STOREFRONT",
            }),
        ).toMatchObject({
            madeHere: true,
            maker: null,
            madeIn: null,
            returnsMode: "STOREFRONT",
            returnsText: null,
        });
    });

    it("seo: blanks are none, so the name and description fill in", () => {
        const values = seoFrom(product());
        expect(values).toEqual({
            seoTitle: "",
            seoDescription: "Rose water serum.",
            seoImageId: "img2",
        });
        expect(seoPatch({ ...values, seoImageId: "" })).toEqual({
            seoTitle: null,
            seoDescription: "Rose water serum.",
            seoImageId: null,
        });
    });

    it("photos: kept ones by id, new ones by where they came from", () => {
        const drafts = photosFrom([
            {
                id: "img1",
                url: "https://cdn.example.test/rose-1.jpg",
                mediaId: "m1",
                alt: "The bottle",
                width: 800,
                height: 600,
                position: 0,
                creditName: null,
                creditUrl: null,
            },
        ]);
        const added = [
            ...drafts,
            {
                mediaId: "m2",
                url: "https://cdn.example.test/rose-2.jpg",
                alt: "",
                width: 1200,
                height: null,
                creditName: null,
                creditUrl: null,
            },
            {
                url: "https://images.example.test/rose-3.jpg",
                alt: "On a shelf",
                width: null,
                height: null,
                creditName: "A. Photographer",
                creditUrl: "https://example.test/a",
            },
        ];
        expect(photosInput(added)).toEqual([
            { id: "img1", alt: "The bottle" },
            {
                mediaId: "m2",
                alt: "",
                width: 1200,
                creditName: null,
                creditUrl: null,
            },
            {
                url: "https://images.example.test/rose-3.jpg",
                alt: "On a shelf",
                creditName: "A. Photographer",
                creditUrl: "https://example.test/a",
            },
        ]);
        expect(samePhotos(drafts, photosFrom([]))).toBe(false);
        expect(samePhotos(added, [...added])).toBe(true);
        expect(samePhotos(added, [added[1], added[0], added[2]])).toBe(false);
        expect(
            samePhotos(drafts, [{ ...drafts[0], alt: "Another word" }]),
        ).toBe(false);
    });
});

describe("stock under a fresh load", () => {
    const line = (variantId: string, quantity: string, warn = "5") => ({
        variantId,
        title: variantId,
        quantity,
        lowStockAlert: warn,
        promised: 0,
    });
    const base: StockDraft = {
        quantity: "0",
        lowStockAlert: "10",
        lines: [line("s", "4"), line("m", "6")],
    };
    // Another section saved: the product came back with new counts (an
    // order took one of M) and a new variant L.
    const fresh: StockDraft = {
        quantity: "0",
        lowStockAlert: "10",
        lines: [line("s", "4"), line("m", "5"), line("l", "0")],
    };

    it("takes the fresh load where nothing was typed", () => {
        expect(mergeDraft(fresh, base, base)).toEqual(fresh);
    });

    it("keeps a count typed for a variant, and the rest fresh", () => {
        const draft: StockDraft = {
            ...base,
            lines: [line("s", "9", "2"), line("m", "6")],
        };
        expect(mergeDraft(fresh, base, draft)).toEqual({
            ...fresh,
            lines: [line("s", "9", "2"), line("m", "5"), line("l", "0")],
        });
    });

    it("keeps the product's own count and warning when they were typed", () => {
        const whole: StockDraft = {
            quantity: "12",
            lowStockAlert: "10",
            lines: [],
        };
        const reloaded: StockDraft = {
            quantity: "11",
            lowStockAlert: "10",
            lines: [],
        };
        expect(
            mergeDraft(reloaded, whole, { ...whole, quantity: "20" }),
        ).toEqual({ quantity: "20", lowStockAlert: "10", lines: [] });
        expect(
            mergeDraft(reloaded, whole, { ...whole, lowStockAlert: "3" }),
        ).toEqual({ quantity: "11", lowStockAlert: "3", lines: [] });
    });
});
