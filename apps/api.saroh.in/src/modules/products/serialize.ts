/**
 * Decimal → string serializers with explicit output shapes. Prisma returns
 * `price` as a Decimal; we render it as a string over HTTP so money stays exact
 * (never a lossy JS float). Declaring concrete return types also keeps the
 * services' public shapes portable — an inferred Prisma type would surface
 * `Decimal` across the pnpm boundary and trip TS2883.
 */

import { toMoneyString } from "../../common/money";
import { bpsToRate, rateToBps } from "../invoices/gst";
import { sanitizeRichHtml } from "../sites/sanitize";
import { asCounts, firstRow } from "./stock-levels";

interface DecimalLike {
    toString(): string;
}

export interface VariantStockDto {
    quantity: number;
    reserved: number;
    lowStockAlert: number;
}

export interface VariantDto {
    id: string;
    productId: string;
    sku: string;
    title: string;
    price: string | null;
    mrp: string | null;
    image: string | null;
    optionValueId: string | null;
    /** The product photo shown when it is picked; null = the cover. */
    imageId: string | null;
    position: number;
    /** Its own stock row, once the product counts per variant. */
    inventory: VariantStockDto | null;
    /** Whether the storefront read from sells it (#510); else "Not sold here". */
    soldHere: boolean;
    createdAt: Date;
}

export interface ProductImageDto {
    id: string;
    url: string;
    mediaId: string | null;
    alt: string;
    width: number | null;
    height: number | null;
    position: number;
    creditName: string | null;
    creditUrl: string | null;
    /** "photo" or "video" (#517). */
    kind: "photo" | "video";
    /** A video's length in seconds; null for a photo or when unknown. */
    durationSec: number | null;
    /** A video's poster, from the library; null when it has none. */
    posterMediaId: string | null;
    posterUrl: string | null;
}

/** Which switches say "on the shop"; a key missing is treated as shown. */
export type ShopFieldsDto = Record<string, boolean>;

export interface ProductDto {
    id: string;
    /** The storefront it was read at (#510: a product belongs to the business). */
    storeId: string;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    categoryId: string | null;
    price: string;
    mrp: string | null;
    currency: string;
    status: string;
    archivedAt: Date | null;
    howToUse: string | null;
    materials: string | null;
    keyPoints: string[];
    madeHere: boolean;
    maker: string | null;
    madeIn: string | null;
    supplierCode: string | null;
    /** GST the price includes, in percent ("18"); null when not set. */
    gstRate: string | null;
    hsnCode: string | null;
    warranty: string | null;
    returnsMode: string;
    returnsText: string | null;
    shopFields: ShopFieldsDto;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageId: string | null;
    optionId: string | null;
    /** Track stock, the product's own switch (#515); it counts only while the business tracks stock too. */
    stockTracked: boolean;
    createdAt: Date;
    updatedAt: Date;
    category?: { id: string; name: string } | null;
}

/**
 * A list row's stock: on hand (`quantity`), what open orders have promised
 * from it, and the warning level — so the list and its quick look show can
 * sell, on hand and promised without another call (#518).
 */
export interface ListStockDto {
    quantity: number;
    promised: number;
    lowStockAlert: number;
}

/**
 * A catalogue row: what the products table shows without opening a product —
 * how many variants it has, the SKU it is known by, and its stock against its
 * own low-stock threshold (a threshold is per product: five is low for mugs
 * and high for wedding cakes).
 */
export interface ProductListItemDto extends ProductDto {
    variantCount: number;
    /** The first variant's SKU; `null` for a product with no variants. */
    sku: string | null;
    /** What an order line can be for: each variant, with its own price. */
    variants: {
        id: string;
        sku: string;
        title: string;
        price: string | null;
    }[];
    inventory: ListStockDto | null;
    /**
     * Marked Sold out by hand at the storefront read from (#515): an
     * untracked product the storefront refuses orders for.
     */
    soldOut: boolean;
}

/** One storefront that sells the product, and whether it is marked Sold out there. */
export interface SoldOutPlaceDto {
    storefrontId: string;
    name: string;
    /** Marked Sold out by hand here (#515); only an untracked product is. */
    soldOut: boolean;
}

export interface ProductDetailDto extends ProductDto {
    variants: VariantDto[];
    images: ProductImageDto[];
    /**
     * "variant" once any variant has its own stock row; "product" otherwise.
     * In variant mode the product row, if any, holds only what open order
     * lines without a variant promise.
     */
    stockMode: "product" | "variant";
    inventory: {
        quantity: number;
        reserved: number;
        lowStockAlert: number;
    } | null;
    option: {
        id: string;
        name: string;
        values: { id: string; value: string }[];
    } | null;
    /** Marked Sold out by hand at the storefront read from (#515). */
    soldOut: boolean;
    /** Every open storefront that sells it, and whether it is marked there. */
    storefronts: SoldOutPlaceDto[];
}

interface RawVariant {
    id: string;
    productId: string;
    sku: string;
    title: string;
    price: DecimalLike | null;
    mrp?: DecimalLike | null;
    image: string | null;
    optionValueId?: string | null;
    imageId?: string | null;
    position?: number;
    /** Its shelf at the storefront read from (#510): one row or none. */
    stockLevels?: StockRowLike[];
    /** Its listing rows at that storefront: none means "Not sold here". */
    listings?: unknown[];
    createdAt: Date;
}

interface StockRowLike {
    onHand: number;
    promised: number;
    lowStockAlert: number;
}

interface RawImage {
    id: string;
    url: string;
    mediaId: string | null;
    alt: string;
    width: number | null;
    height: number | null;
    position: number;
    creditName: string | null;
    creditUrl: string | null;
    kind?: string;
    durationSec?: number | null;
    posterMediaId?: string | null;
    posterUrl?: string | null;
}

interface RawProduct {
    id: string;
    storeId: string | null;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    categoryId: string | null;
    price: DecimalLike;
    mrp: DecimalLike | null;
    currency: string;
    status: string;
    archivedAt: Date | null;
    howToUse: string | null;
    materials: string | null;
    keyPoints: string[];
    madeHere: boolean;
    maker: string | null;
    madeIn: string | null;
    supplierCode: string | null;
    gstRate?: DecimalLike | null;
    hsnCode?: string | null;
    warranty: string | null;
    returnsMode: string;
    returnsText: string | null;
    shopFields: unknown;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageId: string | null;
    optionId: string | null;
    stockTracked: boolean;
    createdAt: Date;
    updatedAt: Date;
    category?: { id: string; name: string } | null;
}

interface RawListingLike {
    storeId: string;
    soldOutAt: Date | null;
}

interface RawProductDetail extends RawProduct {
    variants: RawVariant[];
    images: RawImage[];
    /** Its listings at open storefronts, in the storefronts' order. */
    listings?: (RawListingLike & { store: { name: string } })[];
    /** The product's own row at the storefront read from (variant null). */
    stockLevels: StockRowLike[];
    option: {
        id: string;
        name: string;
        values: { id: string; value: string }[];
    } | null;
}

/** Only boolean entries survive; anything else in the column is ignored. */
export function readShopFields(raw: unknown): ShopFieldsDto {
    const out: ShopFieldsDto = {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        for (const [key, value] of Object.entries(raw)) {
            if (typeof value === "boolean") out[key] = value;
        }
    }
    return out;
}

export function serializeImage(image: RawImage): ProductImageDto {
    return {
        id: image.id,
        url: image.url,
        mediaId: image.mediaId,
        alt: image.alt,
        width: image.width,
        height: image.height,
        position: image.position,
        creditName: image.creditName,
        creditUrl: image.creditUrl,
        kind: image.kind === "video" ? "video" : "photo",
        durationSec: image.durationSec ?? null,
        posterMediaId: image.posterMediaId ?? null,
        posterUrl: image.posterUrl ?? null,
    };
}

export function serializeVariant(variant: RawVariant): VariantDto {
    return {
        id: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        title: variant.title,
        price: variant.price ? toMoneyString(variant.price) : null,
        mrp: variant.mrp ? toMoneyString(variant.mrp) : null,
        image: variant.image,
        optionValueId: variant.optionValueId ?? null,
        imageId: variant.imageId ?? null,
        position: variant.position ?? 0,
        inventory: ((row) => (row ? asCounts(row) : null))(
            firstRow(variant.stockLevels ?? []),
        ),
        soldHere: variant.listings ? variant.listings.length > 0 : true,
        createdAt: variant.createdAt,
    };
}

/**
 * The description is merchant HTML: kept to what the shop can render. Run on
 * every save, and again on every read, so a row written before saves were
 * cleaned never reaches a page raw.
 */
export function cleanDescription(
    value: string | null | undefined,
): string | null {
    if (value == null) return null;
    const clean = sanitizeRichHtml(value).trim();
    return clean === "" ? null : clean;
}

export function serializeProduct(
    product: RawProduct,
    storeId: string,
): ProductDto {
    return {
        id: product.id,
        storeId,
        name: product.name,
        slug: product.slug,
        description: cleanDescription(product.description),
        image: product.image,
        categoryId: product.categoryId,
        price: toMoneyString(product.price),
        mrp: product.mrp ? toMoneyString(product.mrp) : null,
        currency: product.currency,
        status: product.status,
        archivedAt: product.archivedAt,
        howToUse: product.howToUse,
        materials: product.materials,
        keyPoints: product.keyPoints,
        madeHere: product.madeHere,
        maker: product.maker,
        madeIn: product.madeIn,
        supplierCode: product.supplierCode,
        gstRate:
            product.gstRate != null
                ? bpsToRate(rateToBps(product.gstRate) ?? 0)
                : null,
        hsnCode: product.hsnCode ?? null,
        warranty: product.warranty,
        returnsMode: product.returnsMode,
        returnsText: product.returnsText,
        shopFields: readShopFields(product.shopFields),
        seoTitle: product.seoTitle,
        seoDescription: product.seoDescription,
        seoImageId: product.seoImageId,
        optionId: product.optionId,
        stockTracked: product.stockTracked,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        category: product.category ?? null,
    };
}

interface RawProductListItem extends RawProduct {
    _count: { variants: number };
    variants: {
        id: string;
        sku: string;
        title: string;
        price: DecimalLike | null;
        stockLevels?: StockRowLike[];
        listings?: unknown[];
    }[];
    /** The product's own row at the storefront read from (variant null). */
    stockLevels: StockRowLike[];
    /** Its listing at the storefront read from, for the hand-marked Sold out. */
    listings?: RawListingLike[];
}

/** Whether a listing at `storeId` is marked Sold out by hand (#515). */
function soldOutAt(
    listings: readonly RawListingLike[] | undefined,
    storeId: string,
): boolean {
    return (listings ?? []).some(
        (l) => l.storeId === storeId && l.soldOutAt !== null,
    );
}

/**
 * The row's stock. Counted per variant, it is the variants' sum (plus what
 * the product's own row still holds for lines without a variant, as
 * stockTotals adds it)
 * warning at the lowest variant's level; otherwise the product's own row.
 */
function listStock(product: RawProductListItem): ListStockDto | null {
    const own = firstRow(product.stockLevels);
    const rows = product.variants.flatMap((v) => v.stockLevels ?? []);
    if (rows.length === 0) {
        return own ? rowStock(own) : null;
    }
    return {
        quantity: rows.reduce((n, r) => n + r.onHand, 0) + (own?.onHand ?? 0),
        promised:
            rows.reduce((n, r) => n + r.promised, 0) + (own?.promised ?? 0),
        lowStockAlert: Math.min(...rows.map((r) => r.lowStockAlert)),
    };
}

function rowStock(row: StockRowLike): ListStockDto {
    return {
        quantity: row.onHand,
        promised: row.promised,
        lowStockAlert: row.lowStockAlert,
    };
}

export function serializeProductListItem(
    product: RawProductListItem,
    storeId: string,
): ProductListItemDto {
    return {
        ...serializeProduct(product, storeId),
        variantCount: product._count.variants,
        sku: product.variants[0]?.sku ?? null,
        // An order is taken only for a variant this storefront sells.
        variants: product.variants
            .filter((v) => (v.listings ? v.listings.length > 0 : true))
            .map((v) => ({
                id: v.id,
                sku: v.sku,
                title: v.title,
                price: v.price ? toMoneyString(v.price) : null,
            })),
        inventory: listStock(product),
        soldOut: soldOutAt(product.listings, storeId),
    };
}

/** One storefront that sells a catalogue product, and its stock there. */
export interface CatalogueListingDto {
    storeId: string;
    storeName: string;
    inventory: ListStockDto | null;
    /** Marked Sold out by hand here (#515). */
    soldOut: boolean;
    /**
     * Each variant's shelf here (#518), in the product's order: whether this
     * storefront sells it and its stock, null while it is not counted per
     * variant here. Empty for a product without variants.
     */
    variants: {
        variantId: string;
        soldHere: boolean;
        inventory: ListStockDto | null;
    }[];
}

/**
 * A row of the business's catalogue (#531): one per product, whatever
 * storefronts sell it. `storeId`, `variants` and `inventory` are as the
 * storefront filtered by sees them, or — unfiltered — the first storefront
 * that sells it, every variant, and the stock summed across storefronts
 * that count it (warning at the tightest level).
 */
export interface CatalogueItemDto extends ProductListItemDto {
    listings: CatalogueListingDto[];
}

interface StoreStockRowLike extends StockRowLike {
    storeId: string;
}

interface RawCatalogueItem extends RawProduct {
    _count: { variants: number };
    listings: RawListingLike[];
    variants: {
        id: string;
        sku: string;
        title: string;
        price: DecimalLike | null;
        stockLevels: StoreStockRowLike[];
        listings: { listing: { storeId: string } }[];
    }[];
    stockLevels: StoreStockRowLike[];
}

export function serializeCatalogueItem(
    product: RawCatalogueItem,
    stores: readonly { id: string; name: string }[],
    storefront?: string,
): CatalogueItemDto {
    // The product as one storefront sees it: the list-row shape.
    const at = (storeId: string): RawProductListItem => ({
        ...product,
        variants: product.variants.map((v) => ({
            ...v,
            stockLevels: v.stockLevels.filter((r) => r.storeId === storeId),
            listings: v.listings.filter((l) => l.listing.storeId === storeId),
        })),
        stockLevels: product.stockLevels.filter((r) => r.storeId === storeId),
    });
    const listed = new Set(product.listings.map((l) => l.storeId));
    const listings = stores
        .filter((s) => listed.has(s.id))
        .map((s) => {
            const here = at(s.id);
            return {
                storeId: s.id,
                storeName: s.name,
                inventory: listStock(here),
                soldOut: soldOutAt(product.listings, s.id),
                variants: here.variants.map((v) => {
                    const row = firstRow(v.stockLevels ?? []);
                    return {
                        variantId: v.id,
                        soldHere: (v.listings ?? []).length > 0,
                        inventory: row ? rowStock(row) : null,
                    };
                }),
            };
        });
    if (storefront) {
        return {
            ...serializeProductListItem(at(storefront), storefront),
            listings,
        };
    }
    // The whole catalogue: every variant, and the shelves added up.
    const home =
        listings.length > 0 ? listings[0].storeId : (product.storeId ?? "");
    return {
        ...serializeProductListItem(
            {
                ...product,
                variants: product.variants.map((v) => ({
                    ...v,
                    stockLevels: undefined,
                    listings: undefined,
                })),
                stockLevels: [],
            },
            home,
        ),
        inventory: sumStock(listings),
        // Across the business: Sold out only where every storefront says so.
        soldOut: listings.length > 0 && listings.every((l) => l.soldOut),
        listings,
    };
}

/** Summed across the storefronts that count it; null when none do. */
function sumStock(
    listings: readonly CatalogueListingDto[],
): ListStockDto | null {
    const counted = listings.flatMap((l) => (l.inventory ? [l.inventory] : []));
    if (counted.length === 0) return null;
    return {
        quantity: counted.reduce((n, c) => n + c.quantity, 0),
        promised: counted.reduce((n, c) => n + c.promised, 0),
        lowStockAlert: Math.min(...counted.map((c) => c.lowStockAlert)),
    };
}

export function serializeProductDetail(
    product: RawProductDetail,
    storeId: string,
): ProductDetailDto {
    const own = firstRow(product.stockLevels);
    return {
        ...serializeProduct(product, storeId),
        variants: product.variants.map(serializeVariant),
        images: product.images.map(serializeImage),
        stockMode: product.variants.some((v) => (v.stockLevels ?? []).length)
            ? "variant"
            : "product",
        option: product.option,
        inventory: own ? asCounts(own) : null,
        soldOut: soldOutAt(product.listings, storeId),
        storefronts: (product.listings ?? []).map((l) => ({
            storefrontId: l.storeId,
            name: l.store.name,
            soldOut: l.soldOutAt !== null,
        })),
    };
}
