import { z } from "zod";

import { isHsnSac, rateOption } from "@/lib/invoices/gst";
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
    photos: 15,
    videos: 3,
    // 50 MB, as the API signs a video upload for.
    videoBytes: 50 * 1024 * 1024,
    // 8 MB, as the editor promises: a shop photo off a phone is well under.
    photoBytes: 8 * 1024 * 1024,
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
        // GST (ADR-008): the rate the price includes, and the HSN code a
        // registered business prints on its tax invoice.
        gstRate: z.string(),
        hsnCode: z
            .string()
            .refine(
                (v) => v.trim() === "" || isHsnSac(v),
                "An HSN code is 4 to 8 digits.",
            ),
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
        gstRate: rateOption(p.gstRate),
        hsnCode: p.hsnCode ?? "",
    };
}

export function basicsPatch(v: BasicsValues): ProductPatch {
    return {
        name: v.name.trim(),
        slug: v.slug.trim(),
        price: v.price.trim(),
        mrp: nullIfEmpty(v.mrp),
        categoryId: v.categoryId || null,
        gstRate: v.gstRate || null,
        hsnCode: nullIfEmpty(v.hsnCode.replace(/\s+/g, "")),
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
    showKeyPoints: z.boolean(),
});
export type DescriptionValues = z.infer<typeof descriptionSchema>;

export function descriptionFrom(p: ProductDetail): DescriptionValues {
    return {
        description: p.description ?? "",
        keyPoints: p.keyPoints.join("\n"),
        showKeyPoints: shown(p.shopFields, "keyPoints"),
    };
}

export function descriptionPatch(v: DescriptionValues): ProductPatch {
    return {
        description: isEmptyHtml(v.description) ? null : v.description,
        keyPoints: splitLines(v.keyPoints),
        shopFields: { keyPoints: v.showKeyPoints },
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
});
export type DetailsValues = z.infer<typeof detailsSchema>;

export function detailsFrom(p: ProductDetail): DetailsValues {
    return {
        howToUse: p.howToUse ?? "",
        materials: p.materials ?? "",
        showHowToUse: shown(p.shopFields, "howToUse"),
        showMaterials: shown(p.shopFields, "materials"),
    };
}

/** Only this section's switches: the API merges them into the rest. */
export function detailsPatch(v: DetailsValues): ProductPatch {
    return {
        howToUse: nullIfEmpty(v.howToUse),
        materials: nullIfEmpty(v.materials),
        shopFields: {
            howToUse: v.showHowToUse,
            materials: v.showMaterials,
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
        showMadeIn: z.boolean(),
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
        showMadeIn: shown(p.shopFields, "madeIn"),
        showWarranty: shown(p.shopFields, "warranty"),
        showReturns: shown(p.shopFields, "returns"),
    };
}

export function madeByPatch(v: MadeByValues): ProductPatch {
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
            maker: v.showMaker,
            madeIn: v.showMadeIn,
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

/** One photo or video in the set (#517); a draft without a kind is a photo. */
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
    kind?: "photo" | "video";
    /** A video's length in seconds. */
    durationSec?: number | null;
    /** A video's poster: a library image, and where it is shown from. */
    posterMediaId?: string | null;
    posterUrl?: string | null;
}

export function isVideo(p: Pick<PhotoDraft, "kind">): boolean {
    return p.kind === "video";
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
        kind: i.kind === "video" ? "video" : "photo",
        durationSec: i.durationSec ?? null,
        posterMediaId: i.posterMediaId ?? null,
        posterUrl: i.posterUrl ?? null,
    }));
}

/** What the media set's save sends: a kept item by id, a new one by its source. */
export function photosInput(photos: PhotoDraft[]) {
    return photos.map((p) =>
        p.id
            ? { id: p.id, alt: p.alt }
            : isVideo(p)
              ? {
                    kind: "video" as const,
                    mediaId: p.mediaId ?? "",
                    alt: p.alt,
                    ...(p.durationSec != null
                        ? { durationSec: p.durationSec }
                        : {}),
                    ...(p.posterMediaId
                        ? { posterMediaId: p.posterMediaId }
                        : {}),
                }
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

/** The same photos and videos, in the same order, with the same words? */
export function samePhotos(a: PhotoDraft[], b: PhotoDraft[]): boolean {
    return (
        a.length === b.length &&
        a.every((p, i) => p.url === b[i]?.url && p.alt === b[i]?.alt)
    );
}

/** How many of each the set holds. */
export function mediaCounts(items: PhotoDraft[]): {
    photos: number;
    videos: number;
} {
    const videos = items.filter(isVideo).length;
    return { photos: items.length - videos, videos };
}

/** "3 of 15 photos · 1 of 3 videos". */
export function mediaCounter(items: PhotoDraft[]): string {
    const { photos, videos } = mediaCounts(items);
    return `${photos} of ${LIMITS.photos} photos · ${videos} of ${LIMITS.videos} videos`;
}

export const PHOTOS_FULL_MESSAGE = `Already ${LIMITS.photos} photos — take one off first.`;
export const VIDEOS_FULL_MESSAGE = `Already ${LIMITS.videos} videos — take one off first.`;
export const NOT_MEDIA_MESSAGE =
    "That is not a photo or a video. Choose a JPG, PNG, WebP, MP4 or MOV.";
export const VIDEO_TOO_BIG_MESSAGE =
    "That video is over 50 MB. Keep it under a minute, or export it smaller.";
export const PHOTO_TOO_BIG_MESSAGE =
    "That photo is over 8 MB. Most phones can export a smaller copy.";

/**
 * The line under the grid (#525): what can still be added once one kind is
 * full, else the sizes it takes. `full` colours it as a warning.
 */
export function mediaLimitNote(items: PhotoDraft[]): {
    text: string;
    full: boolean;
} {
    const { photos, videos } = mediaCounts(items);
    const photosFull = photos >= LIMITS.photos;
    const videosFull = videos >= LIMITS.videos;
    if (photosFull && videosFull)
        return {
            text: `Full: ${LIMITS.photos} photos and ${LIMITS.videos} videos. Take one off to add another.`,
            full: true,
        };
    if (photosFull) {
        const left = LIMITS.videos - videos;
        return {
            text: `${LIMITS.photos} photos is the most. You can still add ${left} more video${left === 1 ? "" : "s"}.`,
            full: true,
        };
    }
    if (videosFull)
        return {
            text: `${LIMITS.videos} videos is the most. Photos can still be added.`,
            full: true,
        };
    return {
        text: "Photos up to 8 MB, videos up to 50 MB. Drop files onto the grid, or use the tiles.",
        full: false,
    };
}

/** The two video types a product takes; the API checks the bytes too. */
export const VIDEO_TYPES = ["video/mp4", "video/quicktime"] as const;
/** For a file input: photos, MP4 and MOV. */
export const MEDIA_ACCEPT = "image/*,video/mp4,video/quicktime,.mov";

/**
 * Why a picked file can't go on the product, in the words the editor shows —
 * or "" when it can. Checked before anything is uploaded.
 */
export function mediaFileProblem(
    file: { type: string; size: number },
    items: PhotoDraft[],
): string {
    const video = (VIDEO_TYPES as readonly string[]).includes(file.type);
    if (!video && !file.type.startsWith("image/")) return NOT_MEDIA_MESSAGE;
    const { photos, videos } = mediaCounts(items);
    if (video) {
        if (videos >= LIMITS.videos) return VIDEOS_FULL_MESSAGE;
        if (file.size > LIMITS.videoBytes) return VIDEO_TOO_BIG_MESSAGE;
        return "";
    }
    if (photos >= LIMITS.photos) return PHOTOS_FULL_MESSAGE;
    return file.size > LIMITS.photoBytes ? PHOTO_TOO_BIG_MESSAGE : "";
}

/** A video's length as its badge shows it: "0:24", "1:05". */
export function formatDuration(seconds: number | null | undefined): string {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
    const whole = Math.round(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
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

/** One variant's count as the Stock section edits it. */
export interface StockLine {
    variantId: string;
    title: string;
    quantity: string;
    lowStockAlert: string;
    promised: number;
}

/** The Stock section's values: the product's own count and each variant's. */
export interface StockDraft {
    quantity: string;
    lowStockAlert: string;
    lines: StockLine[];
}

/**
 * A fresh load (another section saved) under unsaved edits: take the fresh
 * lines, keeping what was typed for each variant still there.
 */
export function mergeDraft(
    fresh: StockDraft,
    base: StockDraft,
    draft: StockDraft,
): StockDraft {
    const edited = (a: StockLine, b: StockLine | undefined) =>
        a.quantity !== b?.quantity || a.lowStockAlert !== b.lowStockAlert;
    const typed: Partial<Record<string, StockLine>> = {};
    for (const l of draft.lines) {
        const was = base.lines.find((b) => b.variantId === l.variantId);
        if (edited(l, was)) typed[l.variantId] = l;
    }
    return {
        quantity:
            draft.quantity !== base.quantity ? draft.quantity : fresh.quantity,
        lowStockAlert:
            draft.lowStockAlert !== base.lowStockAlert
                ? draft.lowStockAlert
                : fresh.lowStockAlert,
        lines: fresh.lines.map((l) => {
            const mine = typed[l.variantId];
            return mine
                ? {
                      ...l,
                      quantity: mine.quantity,
                      lowStockAlert: mine.lowStockAlert,
                  }
                : l;
        }),
    };
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
    return (
        html
            // `[^<>]`, not `[^>]`: a run of "<" with no ">" is then linear
            // rather than quadratic (js/polynomial-redos). The merchant's
            // own description, in their own browser, so never an attack.
            .replace(/<[^<>]*>/g, " ")
            .replace(/&nbsp;/g, " ")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&quot;/g, '"')
            // Last, so "&amp;lt;" reads "&lt;" and is not decoded twice.
            .replace(/&amp;/g, "&")
            .replace(/\s+/g, " ")
            .trim()
    );
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

// ---- The editor's sections, as the shell sees them ----

/** Each part of the editor that saves on its own, top to bottom. */
export const SECTION_ORDER = [
    "basics",
    "description",
    "details",
    "madeby",
    "photos",
    "visibility",
    "variants",
    "stock",
] as const;
export type SectionKey = (typeof SECTION_ORDER)[number];

/** How a section is named where the editor talks about it. */
export const SECTION_NAMES: Record<SectionKey, string> = {
    basics: "Basics",
    description: "Description",
    details: "How to use and ingredients",
    madeby: "Made by and returns",
    photos: "Photos and videos",
    visibility: "Visibility",
    variants: "Variants",
    stock: "Stock",
};

/** The short labels of the section jumps under the header. */
export const SECTION_JUMPS: Record<SectionKey, string> = {
    basics: "Basics",
    description: "Description",
    details: "How to use",
    madeby: "Made by",
    photos: "Photos",
    visibility: "Visibility",
    variants: "Variants",
    stock: "Stock",
};

/**
 * What Basics must fix before it can save, in the words its bar uses — one
 * line, the first thing wrong. Empty when it can save.
 */
export function basicsProblem(v: BasicsValues, creating: boolean): string {
    const name = v.name.trim();
    if (!name) return "Add a name first.";
    if (v.name.length > LIMITS.name) return "The name is over 150 characters.";
    if (!creating && !basicsSchema.safeParse(v).success) {
        const slug = v.slug.trim();
        if (!slug || slug.length > LIMITS.slug || !/^[a-z0-9-]+$/.test(slug))
            return "Fix the address first.";
    }
    if (!v.price.trim()) return "Add a price first.";
    if (!isMoney(v.price)) return "Price: a number with at most two decimals.";
    if (v.mrp.trim() && !isMoney(v.mrp))
        return "MRP: a number with at most two decimals.";
    if (v.mrp.trim() && paise(v.mrp) < paise(v.price))
        return "MRP can't be lower than the price it sells for.";
    return "";
}

/** The first message a zod schema has for these values, or "". */
export function firstProblem<T>(schema: z.ZodType<T>, values: T): string {
    const r = schema.safeParse(values);
    return r.success ? "" : (r.error.issues[0]?.message ?? "");
}

/**
 * The line in the editor's header: what is saved, what is not, and what
 * needs a fix before Save all can take it.
 */
export function saveHint(
    dirty: SectionKey[],
    stuck: SectionKey[],
    names: Record<SectionKey, string> = SECTION_NAMES,
): string {
    if (dirty.length === 0) return "All changes saved";
    const head =
        dirty.length === 1
            ? `${names[dirty[0]]} is unsaved`
            : `${dirty.length} sections unsaved`;
    if (stuck.length === 0) return head;
    return `${head} · ${joinAnd(stuck.map((k) => names[k]))} ${
        stuck.length === 1 ? "needs" : "need"
    } a fix`;
}

/** Save all takes the sections that can save and leaves the rest, said. */
export function partitionSections(
    dirty: SectionKey[],
    problems: Partial<Record<SectionKey, string>>,
): { savable: SectionKey[]; stuck: SectionKey[] } {
    const ordered = SECTION_ORDER.filter((k) => dirty.includes(k));
    return {
        savable: ordered.filter((k) => !problems[k]),
        stuck: ordered.filter((k) => !!problems[k]),
    };
}

/** "Saved basics, description." — and what was left behind, if anything. */
export function savedMessage(
    saved: SectionKey[],
    stuck: SectionKey[],
    single?: string,
    names: Record<SectionKey, string> = SECTION_NAMES,
): string {
    const head =
        saved.length === 1
            ? (single ?? `${names[saved[0]]} saved.`)
            : `Saved ${saved.map((k) => names[k].toLowerCase()).join(", ")}.`;
    if (stuck.length === 0) return head;
    return `${head} ${joinAnd(stuck.map((k) => names[k]))} ${
        stuck.length === 1 ? "needs" : "need"
    } a fix first.`;
}

/** "a, b and c". */
export function joinAnd(items: string[]): string {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}
