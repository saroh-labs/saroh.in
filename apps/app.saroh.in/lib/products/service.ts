import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson, getList } from "@/lib/api/http";

/**
 * Catalog data access for app.saroh.in — products, categories, variants, and
 * inventory. Forwards the session cookie to api.saroh.in, which enforces store
 * membership (read = access, write = owner/EDITOR+). Prices are decimal strings
 * end-to-end so money never round-trips through a float. Server-only.
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
}

/**
 * A catalogue row as the list endpoint returns it: the product, how many
 * variants it has, the SKU it is known by, and its stock against its own
 * low-stock threshold.
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
    inventory: { quantity: number; lowStockAlert: number } | null;
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
    warranty: string | null;
    returnsMode: "STOREFRONT" | "OWN";
    returnsText: string | null;
    shopFields: ShopFields;
    seoTitle: string | null;
    seoDescription: string | null;
    seoImageId: string | null;
    optionId: string | null;
    images: ProductImage[];
    stockMode: "product" | "variant";
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

export type ResultField =
    | "name"
    | "slug"
    | "price"
    | "mrp"
    | "categoryId"
    | "optionId"
    | "sku"
    | "title"
    | "parentId"
    | "description"
    | "howToUse"
    | "materials"
    | "keyPoints"
    | "maker"
    | "returnsText"
    | "shopFields"
    | "seoTitle"
    | "seoDescription"
    | "seoImageId"
    | "images"
    | "optionValueId"
    | "imageId"
    | "variants"
    | "variantId"
    | "quantity";

export type Result<T = { ok: true }> =
    { ok: true; data: T } | { ok: false; error: string; field?: ResultField };

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
    return { ...failure, field: failure.field as ResultField | undefined };
}

// ---- Products ----

export function listProducts(
    storeId: string,
    status?: ProductStatus,
): Promise<ProductListItem[]> {
    const q = status ? `?status=${status}` : "";
    return getList<ProductListItem>(`/stores/${storeId}/products${q}`);
}

export function getProduct(
    storeId: string,
    productId: string,
): Promise<ProductDetail | null> {
    return getJson<ProductDetail>(`/stores/${storeId}/products/${productId}`);
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

export function createProduct(storeId: string, input: NewProductInput) {
    return mutate(`/stores/${storeId}/products`, "POST", input);
}

export function updateProduct(
    storeId: string,
    productId: string,
    input: ProductInput,
) {
    return mutate(`/stores/${storeId}/products/${productId}`, "PUT", input);
}

export function deleteProduct(storeId: string, productId: string) {
    return mutate(`/stores/${storeId}/products/${productId}`, "DELETE");
}

// ---- Categories ----

export function listCategories(storeId: string): Promise<Category[]> {
    return getList<Category>(`/stores/${storeId}/categories`);
}

export interface CategoryInput {
    name: string;
    slug?: string;
    parentId?: string | null;
}

export function createCategory(storeId: string, input: CategoryInput) {
    return mutate(`/stores/${storeId}/categories`, "POST", input);
}

export function updateCategory(
    storeId: string,
    categoryId: string,
    input: CategoryInput,
) {
    return mutate(`/stores/${storeId}/categories/${categoryId}`, "PUT", input);
}

export function deleteCategory(storeId: string, categoryId: string) {
    return mutate(`/stores/${storeId}/categories/${categoryId}`, "DELETE");
}

// ---- Options (Settings → Options) ----

/** A way customers choose — Size, Shade — and the values it offers. */
export interface ProductOptionView {
    id: string;
    name: string;
    productCount: number;
    values: { id: string; value: string; variantCount: number }[];
}

export function listOptions(storeId: string): Promise<ProductOptionView[]> {
    return getList<ProductOptionView>(`/stores/${storeId}/options`);
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

export function createVariant(
    storeId: string,
    productId: string,
    input: VariantInput,
) {
    return mutate(
        `/stores/${storeId}/products/${productId}/variants`,
        "POST",
        input,
    );
}

export function updateVariant(
    storeId: string,
    productId: string,
    variantId: string,
    input: VariantInput,
) {
    return mutate(
        `/stores/${storeId}/products/${productId}/variants/${variantId}`,
        "PUT",
        input,
    );
}

export function deleteVariant(
    storeId: string,
    productId: string,
    variantId: string,
) {
    return mutate(
        `/stores/${storeId}/products/${productId}/variants/${variantId}`,
        "DELETE",
    );
}

// ---- Inventory ----

export interface InventoryInput {
    quantity: number;
    lowStockAlert?: number;
}

export function setInventory(
    storeId: string,
    productId: string,
    input: InventoryInput,
) {
    return mutate<Inventory>(
        `/stores/${storeId}/products/${productId}/inventory`,
        "PUT",
        input,
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

export function patchProduct(
    storeId: string,
    productId: string,
    patch: ProductPatch,
) {
    return mutate<ProductDetail>(
        `/stores/${storeId}/products/${productId}`,
        "PATCH",
        patch,
    );
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
}

export function replaceProductImages(
    storeId: string,
    productId: string,
    images: ProductImageInput[],
) {
    return mutate<ProductImage[]>(
        `/stores/${storeId}/products/${productId}/images`,
        "PUT",
        { images },
    );
}

export interface StockView {
    productId: string;
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

/** Every variant's count at once; switches the product to per-variant. */
export function setVariantStock(
    storeId: string,
    productId: string,
    variants: { variantId: string; quantity: number; lowStockAlert: number }[],
) {
    return mutate<StockView>(
        `/stores/${storeId}/products/${productId}/inventory/variants`,
        "PUT",
        { variants },
    );
}

export function reorderVariants(
    storeId: string,
    productId: string,
    ids: string[],
) {
    return mutate<Variant[]>(
        `/stores/${storeId}/products/${productId}/variants/order`,
        "PUT",
        { ids },
    );
}
