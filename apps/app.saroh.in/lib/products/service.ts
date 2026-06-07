import { headers } from "next/headers";

/**
 * Catalog data access for app.saroh.in — products, categories, variants, and
 * inventory. Forwards the session cookie to api.saroh.in, which enforces store
 * membership (read = access, write = owner/EDITOR+). Prices are decimal strings
 * end-to-end so money never round-trips through a float. Server-only.
 */

const API_URL =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "https://api.saroh.in";

export type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface Product {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    categoryId: string | null;
    price: string;
    currency: string;
    status: ProductStatus;
    category?: { id: string; name: string } | null;
}

export interface Variant {
    id: string;
    productId: string;
    sku: string;
    title: string;
    price: string | null;
    image: string | null;
}

export interface Inventory {
    quantity: number;
    reserved: number;
    lowStockAlert: number;
}

export interface ProductDetail extends Product {
    variants: Variant[];
    inventory: Inventory | null;
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
    | "categoryId"
    | "sku"
    | "parentId";

export type Result<T = { ok: true }> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: ResultField };

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const cookie = (await headers()).get("cookie") ?? "";
    return fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            "content-type": "application/json",
            cookie,
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    });
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
    const res = await apiFetch(path);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
}

async function mutate<T = { id: string }>(
    path: string,
    method: "POST" | "PUT" | "DELETE",
    body?: unknown,
): Promise<Result<T>> {
    const res = await apiFetch(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = (await res.json().catch(() => null)) as
        | (Record<string, unknown> & {
              message?: string;
              field?: ResultField;
          })
        | null;
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return {
        ok: false,
        error: data?.message ?? "Something went wrong",
        field: data?.field,
    };
}

// ---- Products ----

export function listProducts(
    storeId: string,
    status?: ProductStatus,
): Promise<Product[]> {
    const q = status ? `?status=${status}` : "";
    return getJson<Product[]>(`/stores/${storeId}/products${q}`, []);
}

export async function getProduct(
    storeId: string,
    productId: string,
): Promise<ProductDetail | null> {
    const res = await apiFetch(`/stores/${storeId}/products/${productId}`);
    if (!res.ok) return null;
    return (await res.json()) as ProductDetail;
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

export function createProduct(storeId: string, input: ProductInput) {
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
    return getJson<Category[]>(`/stores/${storeId}/categories`, []);
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

// ---- Variants ----

export interface VariantInput {
    sku: string;
    title: string;
    price?: string | null;
    image?: string | null;
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
