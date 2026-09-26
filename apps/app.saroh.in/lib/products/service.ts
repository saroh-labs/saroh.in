import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson, getList, orgBase } from "@/lib/api/http";

import type { SoldOutPlace } from "./tracking";

/**
 * Catalog data access for app.saroh.in — products, categories, variants, and
 * inventory. Forwards the session cookie to api.saroh.in, which enforces the
 * business role (read = `store:read`, write = `store:write`). Prices are
 * decimal strings end-to-end so money never round-trips through a float.
 * Server-only.
 *
 * Products belong to the business (#531): every call goes to
 * `organizations/:org/products`. A `storeId` argument names the storefront
 * whose shelf and listing the call reads or writes — the one the screen is
 * open at — and travels as `?storefront=`.
 */

export type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface Product {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    categoryId: string | null;
    price: string;
    /** The printed / compare-at price, shown struck through. */
    mrp?: string | null;
    currency: string;
    status: ProductStatus;
    /** When it was archived; null unless it is. */
    archivedAt?: string | null;
    category?: { id: string; name: string } | null;
}

/** Which details the shop shows; a key missing means shown. */
export type ShopFields = Partial<
    Record<
        | "howToUse"
        | "materials"
        | "keyPoints"
        | "maker"
        | "madeIn"
        | "warranty"
        | "returns",
        boolean
    >
>;

export interface ProductImage {
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
    /** A video's length in seconds. */
    durationSec: number | null;
    /** A video's poster, from the library. */
    posterMediaId: string | null;
    posterUrl: string | null;
}

/**
 * A product as a list shows it: the product, how many variants it has, the
 * SKU it is known by, and its stock against its own low-stock threshold.
 */
export interface ProductListItem extends Product {
    storeId: string;
    updatedAt: string;
    variantCount: number;
    sku: string | null;
    /** Each variant an order line can be for, with its own price if any. */
    variants: {
        id: string;
        sku: string;
        title: string;
        price: string | null;
    }[];
    inventory: ListStock | null;
    /**
     * Marked sold out by hand at this storefront (#515): an untracked
     * product it refuses orders for. Absent from an older API.
     */
    soldOut?: boolean;
}

/**
 * A list row's stock (#518): on hand (`quantity`), what open orders have
 * promised from it, and the warning level. Can sell is on hand minus
 * promised.
 */
export interface ListStock {
    quantity: number;
    promised: number;
    lowStockAlert: number;
}

/** One storefront that sells a catalogue product, and its stock there. */
export interface CatalogueListing {
    storeId: string;
    storeName: string;
    inventory: ListStock | null;
    /** Marked sold out by hand here (#515). Absent from an older API. */
    soldOut?: boolean;
    /**
     * Each variant's shelf here (#518): whether this storefront sells it,
     * and its stock — null while it is not counted per variant here.
     */
    variants: {
        variantId: string;
        soldHere: boolean;
        inventory: ListStock | null;
    }[];
}

/**
 * A row of the business's catalogue (#531): one per product, with each
 * storefront that sells it. Read with a storefront, `storeId`, `variants`
 * and `inventory` are that storefront's; without, the stock is summed across
 * the storefronts that count it.
 */
export interface CatalogueProduct extends ProductListItem {
    listings: CatalogueListing[];
}

export interface Variant {
    id: string;
    productId: string;
    sku: string;
    title: string;
    price: string | null;
    image: string | null;
    mrp?: string | null;
    optionValueId?: string | null;
    /** The product photo shown when picked; null = the cover. */
    imageId?: string | null;
    position?: number;
    /** Its own stock, once the product counts per variant. */
    inventory?: Inventory | null;
}

export interface Inventory {
    quantity: number;
    reserved: number;
    lowStockAlert: number;
}

/** A custom field (#482) as a product holds it. */
export interface ProductCustomField {
    id: string;
    name: string;
    type: "TEXT" | "NUMBER" | "DATE" | "YES_NO";
    onShop: boolean;
    value: string | null;
}

export interface ProductDetail extends Product {
    /** The storefront whose shelf and listing it was read at (#531). */
    storeId: string;
    variants: Variant[];
    /** The fields its category asks for, with its values. */
    customFields: ProductCustomField[];
    /** From the storefront's allergen list (#483). */
    allergens: {
        contains: { id: string; name: string }[];
        mayContain: { id: string; name: string }[];
    };
    inventory: Inventory | null;
    mrp: string | null;
    howToUse: string | null;
    materials: string | null;
    keyPoints: string[];
    madeHere: boolean;
    maker: string | null;
    madeIn: string | null;
    supplierCode: string | null;
    /** GST the price includes, in percent ("18"), ADR-008; null when unset. */
    gstRate?: string | null;
    hsnCode?: string | null;
    warranty: string | null;
    returnsMode: "STOREFRONT" | "OWN";
    returnsText: string | null;
    shopFields: ShopFields;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageId: string | null;
    optionId: string | null;
    /** Track stock, the product's own switch (#515); it counts only while the business tracks stock too. */
    stockTracked: boolean;
    /** Marked sold out by hand at the storefront read from (#515). */
    soldOut?: boolean;
    /** Every open storefront that sells it, and whether it is marked there. */
    storefronts?: SoldOutPlace[];
    images: ProductImage[];
    stockMode: "product" | "variant";
    /**
     * Still counting as a whole: what open orders promise per variant id,
     * which moves onto each variant's own count when it switches.
     */
    variantPromises: Partial<Record<string, number>>;
    option: {
        id: string;
        name: string;
        values: { id: string; value: string }[];
    } | null;
    createdAt: string;
    updatedAt: string;
}

export interface Category {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    _count: { products: number; children: number };
}

/** The fields a refusal can be about, so a form can put it beside one. */
const RESULT_FIELDS = [
    "name",
    "slug",
    "price",
    "mrp",
    "categoryId",
    "optionId",
    "sku",
    "title",
    "parentId",
    "description",
    "howToUse",
    "materials",
    "keyPoints",
    "maker",
    "returnsText",
    "shopFields",
    "seoTitle",
    "seoDescription",
    "seoImageId",
    "images",
    "optionValueId",
    "imageId",
    "variants",
    "variantId",
    "quantity",
] as const;

export type ResultField = (typeof RESULT_FIELDS)[number];

/** The API's `field`, if it is one of ours. */
export function resultField(field?: string): ResultField | undefined {
    return RESULT_FIELDS.find((f) => f === field);
}

export type Result<T = { ok: true }> =
    { ok: true; data: T } | { ok: false; error: string; field?: ResultField };

const NO_BUSINESS = "Pick a business first, then try again.";

/** `?storefront=` for a call about one storefront's shelf and listing. */
function at(storeId?: string | null): string {
    return storeId ? `?storefront=${encodeURIComponent(storeId)}` : "";
}

/** A product's address under the business, or null with none active. */
async function productPath(productId?: string): Promise<string | null> {
    const base = await orgBase();
    if (!base) return null;
    return productId
        ? `${base}/products/${encodeURIComponent(productId)}`
        : `${base}/products`;
}

/** `mutate` on a product path; no business active is said, not thrown. */
async function mutateProduct<T = { id: string }>(
    productId: string | undefined,
    rest: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
): Promise<Result<T>> {
    const path = await productPath(productId);
    if (!path) return { ok: false, error: NO_BUSINESS };
    return mutate<T>(`${path}${rest}`, method, body);
}

async function mutate<T = { id: string }>(
    path: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
): Promise<Result<T>> {
    const res = await apiFetch(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    const failure = toFailure(data, "Something went wrong");
    return { ...failure, field: resultField(failure.field) };
}

// ---- Products ----

/**
 * The business's catalogue, one row per product. `storefront` narrows it to
 * what that storefront sells, as that storefront sees it.
 */
export async function listProducts(
    filter: { storefront?: string; status?: ProductStatus } = {},
): Promise<CatalogueProduct[]> {
    const path = await productPath();
    if (!path) return [];
    const q = new URLSearchParams();
    if (filter.storefront) q.set("storefront", filter.storefront);
    if (filter.status) q.set("status", filter.status);
    const query = q.toString();
    return getList<CatalogueProduct>(query ? `${path}?${query}` : path);
}

/**
 * One product, as a storefront sees it: the one named, or else the first
 * that sells it. Null when it is not this business's.
 */
export async function getProduct(
    storeId: string | null | undefined,
    productId: string,
): Promise<ProductDetail | null> {
    const path = await productPath(productId);
    if (!path) return null;
    return getJson<ProductDetail>(`${path}${at(storeId)}`);
}

export interface ProductInput {
    name: string;
    slug?: string;
    description?: string | null;
    image?: string | null;
    categoryId?: string | null;
    price: string;
    currency?: string;
    status?: ProductStatus;
}

/** A new product: its basics, and any of its sections at once (#461). */
export type NewProductInput = ProductInput &
    Omit<ProductPatch, "name" | "price">;

/** A new product of the business, sold at `storeId`. */
export function createProduct(storeId: string, input: NewProductInput) {
    return mutateProduct(undefined, at(storeId), "POST", input);
}

export function updateProduct(productId: string, input: ProductInput) {
    return mutateProduct(productId, "", "PUT", input);
}

/**
 * A draft copy (#518): "… (copy)", sold where the original is, stock at 0.
 * Returns the copy as `getProduct` reads it at `storeId`.
 */
export function duplicateProduct(productId: string, storeId?: string | null) {
    return mutateProduct<ProductDetail>(
        productId,
        `/duplicate${at(storeId)}`,
        "POST",
    );
}

/** Delete it from the catalogue — and so from every storefront. */
export function deleteProduct(productId: string) {
    return mutateProduct(productId, "", "DELETE");
}

// ---- Categories: the business's (#529), whatever storefront sells ----

export async function listCategories(): Promise<Category[]> {
    const base = await orgBase();
    if (!base) return [];
    return getList<Category>(`${base}/catalogue/categories`);
}

export interface CategoryInput {
    name: string;
    slug?: string;
    parentId?: string | null;
}

export async function createCategory(
    input: CategoryInput,
): Promise<Result<{ id: string }>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: NO_BUSINESS };
    return mutate(`${base}/catalogue/categories`, "POST", input);
}

export async function updateCategory(
    categoryId: string,
    input: CategoryInput,
): Promise<Result<{ id: string }>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: NO_BUSINESS };
    return mutate(
        `${base}/catalogue/categories/${encodeURIComponent(categoryId)}`,
        "PUT",
        input,
    );
}

export async function deleteCategory(
    categoryId: string,
): Promise<Result<{ id: string }>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: NO_BUSINESS };
    return mutate(
        `${base}/catalogue/categories/${encodeURIComponent(categoryId)}`,
        "DELETE",
    );
}

// ---- Options (Settings → Options) ----

/** A way customers choose — Size, Shade — and the values it offers. */
export interface ProductOptionView {
    id: string;
    name: string;
    productCount: number;
    values: { id: string; value: string; variantCount: number }[];
}

export async function listOptions(): Promise<ProductOptionView[]> {
    const base = await orgBase();
    if (!base) return [];
    return getList<ProductOptionView>(`${base}/catalogue/options`);
}

// ---- Variants ----

export interface VariantInput {
    sku: string;
    title: string;
    price?: string | null;
    mrp?: string | null;
    image?: string | null;
    optionValueId?: string | null;
    imageId?: string | null;
}

export function createVariant(productId: string, input: VariantInput) {
    return mutateProduct(productId, "/variants", "POST", input);
}

export function updateVariant(
    productId: string,
    variantId: string,
    input: VariantInput,
) {
    return mutateProduct(
        productId,
        `/variants/${encodeURIComponent(variantId)}`,
        "PUT",
        input,
    );
}

export function deleteVariant(productId: string, variantId: string) {
    return mutateProduct(
        productId,
        `/variants/${encodeURIComponent(variantId)}`,
        "DELETE",
    );
}

// ---- Inventory ----

export interface InventoryInput {
    quantity: number;
    lowStockAlert?: number;
}

/** Its count at `storeId`. */
export function setInventory(
    storeId: string,
    productId: string,
    input: InventoryInput,
) {
    return mutateProduct<Inventory>(
        productId,
        `/inventory${at(storeId)}`,
        "PUT",
        input,
    );
}

/** What turning Track stock on or off did (#515). */
export interface StockTrackingResult {
    productId: string;
    tracked: boolean;
    /** The business's switch: off, and no product counts stock. */
    businessTracks: boolean;
    /** Shelves counted to 0 by turning it off. */
    counted: number;
}

/**
 * Track stock on or off for a product, everywhere it sells. Owner/Admin only
 * (`store:write`). Off is refused while open orders hold its units ("N are
 * promised to open orders — fulfil or cancel them first") and counts each
 * shelf to 0; on starts each shelf at 0, Sold out until counted.
 */
export function setProductStockTracking(productId: string, tracked: boolean) {
    return mutateProduct<StockTrackingResult>(
        productId,
        "/stock-tracking",
        "PUT",
        { tracked },
    );
}

/**
 * Mark an untracked product sold out at one storefront, or available again
 * (#515). Whoever may count and move stock; a product that counts stock is
 * refused ("This product counts its stock, …").
 */
export function setProductSoldOut(
    productId: string,
    storefrontId: string,
    soldOut: boolean,
) {
    return mutateProduct<SoldOutPlace & { productId: string }>(
        productId,
        "/sold-out",
        "PUT",
        { storefrontId, soldOut },
    );
}

// ---- Products v2: one section at a time (#461, #462) ----

/** Any subset of a product's own fields — one editor section's save. */
export interface ProductPatch {
    name?: string;
    slug?: string;
    description?: string | null;
    categoryId?: string | null;
    optionId?: string | null;
    price?: string;
    mrp?: string | null;
    status?: ProductStatus;
    howToUse?: string | null;
    materials?: string | null;
    keyPoints?: string[];
    madeHere?: boolean;
    maker?: string | null;
    madeIn?: string | null;
    supplierCode?: string | null;
    gstRate?: string | null;
    hsnCode?: string | null;
    warranty?: string | null;
    returnsMode?: "STOREFRONT" | "OWN";
    returnsText?: string | null;
    shopFields?: ShopFields;
    seoTitle?: string | null;
    seoDescription?: string | null;
    seoImageId?: string | null;
    /** Custom fields: field id → value; "" or null clears it. */
    customFields?: Record<string, string | null>;
    /** Allergen ids; each list given replaces its kind. */
    contains?: string[];
    mayContain?: string[];
}

/** One section's save; returns the product as `storeId` sees it. */
export function patchProduct(
    storeId: string,
    productId: string,
    patch: ProductPatch,
) {
    return mutateProduct<ProductDetail>(productId, at(storeId), "PATCH", patch);
}

/** One photo of the ordered set: kept (id), from the library, or an address. */
export interface ProductImageInput {
    id?: string;
    mediaId?: string;
    url?: string;
    alt?: string;
    width?: number;
    height?: number;
    creditName?: string | null;
    creditUrl?: string | null;
    /** A new video: an uploaded MP4 or MOV (mediaId), with its poster. */
    kind?: "photo" | "video";
    durationSec?: number | null;
    posterMediaId?: string | null;
}

export function replaceProductImages(
    productId: string,
    images: ProductImageInput[],
) {
    return mutateProduct<ProductImage[]>(productId, "/images", "PUT", {
        images,
    });
}

export interface StockView {
    productId: string;
    /** Track stock (#515): the product's switch and the business's. */
    tracked: boolean;
    mode: "product" | "variant";
    quantity: number;
    reserved: number;
    lowStockAlert: number;
    variants: {
        variantId: string;
        quantity: number;
        reserved: number;
        lowStockAlert: number;
    }[];
}

/** Every variant's count at `storeId`; switches the product to per-variant. */
export function setVariantStock(
    storeId: string,
    productId: string,
    variants: { variantId: string; quantity: number; lowStockAlert: number }[],
) {
    return mutateProduct<StockView>(
        productId,
        `/inventory/variants${at(storeId)}`,
        "PUT",
        { variants },
    );
}

/** The variants in order; returns them as `storeId` sees them. */
export function reorderVariants(
    storeId: string,
    productId: string,
    ids: string[],
) {
    return mutateProduct<Variant[]>(
        productId,
        `/variants/order${at(storeId)}`,
        "PUT",
        { ids },
    );
}
