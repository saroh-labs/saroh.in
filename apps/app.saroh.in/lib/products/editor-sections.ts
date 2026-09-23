import { z } from "zod";

import type {
    ProductDetail,
    ProductImage,
    ProductPatch,
    ShopFields,
} from "@/lib/products/service";

/**
 * The product's editable sections, once, for every place that edits them:
 * the editor v2 sections (#468, #469) and the product page's quick sheets
 * (#467). Each section has a schema (validation and type), a way to read its
 * values from a saved product (the baseline its Unsaved chip compares with),
 * and the patch it sends. Client-safe and pure; tested in
 * `editor-sections.test.ts`.
 *
 * Limits mirror the API's (`products/dto.ts`); the API stays the authority.
 */

export const LIMITS = {
    name: 150,
    slug: 150,
    description: 5000,
    howToUse: 300,
    materials: 2000,
    keyPoint: 150,
    keyPoints: 8,
    shortText: 150,
    returnsText: 200,
    seoTitle: 70,
    seoDescription: 160,
    alt: 250,
    photos: 5,
    sku: 100,
    variantTitle: 150,
} as const;

const MONEY_RE = /^\d+(\.\d{1,2})?$/;
export const MONEY_MESSAGE = "A number with at most two decimal places.";

export function isMoney(value: string): boolean {
    return MONEY_RE.test(value.trim());
}

/** Money as whole paise, for comparisons only — never sent. */
export function paise(value: string): number {
    const [whole = "0", frac = ""] = value.trim().split(".");
    return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

const money = z
    .string()
    .trim()
    .min(1, "Add a price first.")
    .refine(isMoney, MONEY_MESSAGE);

const optionalMoney = z
    .string()
    .trim()
    .refine((v) => v === "" || isMoney(v), MONEY_MESSAGE);

const text = (max: number, message?: string) =>
    z
        .string()
        .max(
            max,
            message ??
                `Keep it under ${max.toLocaleString("en-IN")} characters.`,
        );

const nullIfEmpty = (value: string): string | null => {
    const t = value.trim();
    return t === "" ? null : t;
};

// ---- Basics ----

export const basicsSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(1, "A product needs a name before it can be saved.")
            .max(LIMITS.name, `Keep the name under ${LIMITS.name} characters.`),
        slug: z
            .string()
            .trim()
            .min(
                1,
                "A product needs an address — it is what the link is made of.",
            )
            .max(
                LIMITS.slug,
                `Longer than the ${LIMITS.slug} characters an address can be.`,
            )
            .regex(
                /^[a-z0-9-]+$/,
                "Only lowercase letters, numbers and hyphens.",
            ),
        price: money,
        mrp: optionalMoney,
        categoryId: z.string(),
    })
    .refine(
        (v) =>
            v.mrp === "" || !isMoney(v.price) || paise(v.mrp) >= paise(v.price),
        {
            path: ["mrp"],
            message: "MRP can't be lower than the price it sells for.",
        },
    );
export type BasicsValues = z.infer<typeof basicsSchema>;

export function basicsFrom(p: ProductDetail): BasicsValues {
    return {
        name: p.name,
        slug: p.slug,
        price: trimMoney(p.price),
        mrp: p.mrp ? trimMoney(p.mrp) : "",
        categoryId: p.categoryId ?? "",
    };
}

export function basicsPatch(v: BasicsValues): ProductPatch {
    return {
        name: v.name.trim(),
        slug: v.slug.trim(),
        price: v.price.trim(),
        mrp: nullIfEmpty(v.mrp),
        categoryId: v.categoryId || null,
    };
}

// ---- Description ----

export const descriptionSchema = z.object({
    description: z
        .string()
        .max(
            LIMITS.description,
            "The description is over the 5,000-character limit.",
        ),
    keyPoints: z
        .string()
        .refine(
            (v) =>
                splitLines(v).every((line) => line.length <= LIMITS.keyPoint),
            `Keep each point under ${LIMITS.keyPoint} characters.`,
        )
        .refine(
            (v) => splitLines(v).length <= LIMITS.keyPoints,
            `At most ${LIMITS.keyPoints} key points.`,
        ),
});
export type DescriptionValues = z.infer<typeof descriptionSchema>;

export function descriptionFrom(p: ProductDetail): DescriptionValues {
    return {
        description: p.description ?? "",
        keyPoints: p.keyPoints.join("\n"),
    };
}

export function descriptionPatch(v: DescriptionValues): ProductPatch {
    return {
        description: isEmptyHtml(v.description) ? null : v.description,
        keyPoints: splitLines(v.keyPoints),
    };
}

// ---- Details: how to use / care, ingredients or material ----

export const detailsSchema = z.object({
    howToUse: text(
        LIMITS.howToUse,
        `Keep the line under ${LIMITS.howToUse} characters.`,
    ),
    materials: text(LIMITS.materials),
    showHowToUse: z.boolean(),
    showMaterials: z.boolean(),
    showKeyPoints: z.boolean(),
});
export type DetailsValues = z.infer<typeof detailsSchema>;

export function detailsFrom(p: ProductDetail): DetailsValues {
    return {
        howToUse: p.howToUse ?? "",
        materials: p.materials ?? "",
        showHowToUse: shown(p.shopFields, "howToUse"),
        showMaterials: shown(p.shopFields, "materials"),
        showKeyPoints: shown(p.shopFields, "keyPoints"),
    };
}

export function detailsPatch(
    v: DetailsValues,
    current: ShopFields,
): ProductPatch {
    return {
        howToUse: nullIfEmpty(v.howToUse),
        materials: nullIfEmpty(v.materials),
        shopFields: {
            ...current,
            howToUse: v.showHowToUse,
            materials: v.showMaterials,
            keyPoints: v.showKeyPoints,
        },
    };
}

// ---- Made by, warranty and returns ----

export const madeBySchema = z
    .object({
        madeHere: z.boolean(),
        maker: text(LIMITS.shortText),
        madeIn: text(LIMITS.shortText),
        supplierCode: text(LIMITS.shortText),
        warranty: text(LIMITS.shortText),
        returnsMode: z.enum(["STOREFRONT", "OWN"]),
        returnsText: text(LIMITS.returnsText),
        showMaker: z.boolean(),
        showWarranty: z.boolean(),
        showReturns: z.boolean(),
    })
    .refine((v) => v.madeHere || v.maker.trim() !== "", {
        path: ["maker"],
        message: "Add who makes it, or switch back to Made here.",
    })
    .refine(
        (v) => v.returnsMode === "STOREFRONT" || v.returnsText.trim() !== "",
        {
            path: ["returnsText"],
            message:
                "Write this product's returns rule, or use the storefront's.",
        },
    );
export type MadeByValues = z.infer<typeof madeBySchema>;

export function madeByFrom(p: ProductDetail): MadeByValues {
    return {
        madeHere: p.madeHere,
        maker: p.maker ?? "",
        madeIn: p.madeIn ?? "",
        supplierCode: p.supplierCode ?? "",
        warranty: p.warranty ?? "",
        returnsMode: p.returnsMode,
        returnsText: p.returnsText ?? "",
        showMaker: shown(p.shopFields, "maker"),
        showWarranty: shown(p.shopFields, "warranty"),
        showReturns: shown(p.shopFields, "returns"),
    };
}

export function madeByPatch(
    v: MadeByValues,
    current: ShopFields,
): ProductPatch {
    return {
        madeHere: v.madeHere,
        maker: v.madeHere ? null : nullIfEmpty(v.maker),
        madeIn: v.madeHere ? null : nullIfEmpty(v.madeIn),
        supplierCode: nullIfEmpty(v.supplierCode),
        warranty: nullIfEmpty(v.warranty),
        returnsMode: v.returnsMode,
        returnsText:
            v.returnsMode === "OWN" ? nullIfEmpty(v.returnsText) : null,
        shopFields: {
            ...current,
            maker: v.showMaker,
            warranty: v.showWarranty,
            returns: v.showReturns,
        },
    };
}

// ---- SEO ----

export const seoSchema = z.object({
    seoTitle: text(
        LIMITS.seoTitle,
        `Search engines show about ${LIMITS.seoTitle} characters.`,
    ),
    seoDescription: text(
        LIMITS.seoDescription,
        `Search engines show about ${LIMITS.seoDescription} characters.`,
    ),
    seoImageId: z.string(),
});
export type SeoValues = z.infer<typeof seoSchema>;

export function seoFrom(p: ProductDetail): SeoValues {
    return {
        seoTitle: p.seoTitle ?? "",
        seoDescription: p.seoDescription ?? "",
        seoImageId: p.seoImageId ?? "",
    };
}

export function seoPatch(v: SeoValues): ProductPatch {
    return {
        seoTitle: nullIfEmpty(v.seoTitle),
        seoDescription: nullIfEmpty(v.seoDescription),
        seoImageId: v.seoImageId || null,
    };
}

/**
 * What a search result shows when a field is left empty: the name, the
 * description's first words, the cover. Said on the section, so an empty
 * field reads as "uses X", not as missing.
 */
export function seoFallback(p: { name: string; description: string | null }): {
    title: string;
    description: string;
} {
    const plain = stripHtml(p.description ?? "");
    return {
        title: p.name.slice(0, LIMITS.seoTitle),
        description:
            plain.length > LIMITS.seoDescription
                ? `${plain.slice(0, LIMITS.seoDescription - 1).trimEnd()}…`
                : plain,
    };
}

// ---- Visibility ----

export const visibilitySchema = z.object({
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});
export type VisibilityValues = z.infer<typeof visibilitySchema>;

// ---- Photos ----

export interface PhotoDraft {
    /** Set for a photo already on the product. */
    id?: string;
    mediaId?: string | null;
    url: string;
    alt: string;
    width: number | null;
    height: number | null;
    creditName: string | null;
    creditUrl: string | null;
}

export function photosFrom(images: ProductImage[]): PhotoDraft[] {
    return images.map((i) => ({
        id: i.id,
        mediaId: i.mediaId,
        url: i.url,
        alt: i.alt,
        width: i.width,
        height: i.height,
        creditName: i.creditName,
        creditUrl: i.creditUrl,
    }));
}

/** What the photo set's save sends: a kept photo by id, a new one by its source. */
export function photosInput(photos: PhotoDraft[]) {
    return photos.map((p) =>
        p.id
            ? { id: p.id, alt: p.alt }
            : {
                  ...(p.mediaId ? { mediaId: p.mediaId } : { url: p.url }),
                  alt: p.alt,
                  ...(p.width ? { width: p.width } : {}),
                  ...(p.height ? { height: p.height } : {}),
                  creditName: p.creditName,
                  creditUrl: p.creditUrl,
              },
    );
}

/** The same photos, in the same order, with the same words? */
export function samePhotos(a: PhotoDraft[], b: PhotoDraft[]): boolean {
    return (
        a.length === b.length &&
        a.every((p, i) => p.url === b[i]?.url && p.alt === b[i]?.alt)
    );
}

// ---- Stock ----

export const stockRowSchema = z.object({
    variantId: z.string(),
    title: z.string(),
    quantity: z.string().refine(isCount, "Whole numbers, zero or more."),
    lowStockAlert: z.string().refine(isCount, "Whole numbers, zero or more."),
    promised: z.number(),
});

export function isCount(value: string): boolean {
    return /^\d+$/.test(value.trim());
}

// ---- Helpers ----

/** A money string without trailing ".00", as a merchant would type it. */
export function trimMoney(value: string): string {
    return value.endsWith(".00") ? value.slice(0, -3) : value;
}

export function splitLines(value: string): string[] {
    return value
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== "");
}

export function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
}

/** Tiptap leaves "<p></p>" in an emptied editor; that is no description. */
export function isEmptyHtml(html: string): boolean {
    return stripHtml(html) === "" && !/<img/i.test(html);
}

function shown(fields: ShopFields, key: keyof ShopFields): boolean {
    return fields[key] !== false;
}

/**
 * An address made from a name: lowercase, accents dropped, "&" as "and",
 * anything else a hyphen, trimmed to 150. Empty when nothing survives.
 */
export function slugify(name: string): string {
    return name
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, LIMITS.slug)
        .replace(/-+$/g, "");
}

/**
 * A SKU to start from: the product's initials (up to three words) and the
 * variant's first word — "Hydra Glow Serum" + "50 ml" → "HGS-50ML".
 */
export function suggestSku(productName: string, variantTitle: string): string {
    const initials = productName
        .split(/\s+/)
        .filter((w) => /[a-z0-9]/i.test(w))
        .slice(0, 3)
        .map((w) => w.replace(/[^a-z0-9]/gi, "").charAt(0))
        .join("")
        .toUpperCase();
    const tail = variantTitle
        .replace(/[^a-z0-9 ]/gi, "")
        .replace(/\s+/g, "")
        .slice(0, 6)
        .toUpperCase();
    const head = initials || "SKU";
    return tail ? `${head}-${tail}` : `${head}-`;
}
