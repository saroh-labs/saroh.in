import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson } from "@/lib/api/http";
import type { Result, ResultField } from "@/lib/products/service";

/**
 * Product settings (#470) — one storefront's categories, options and
 * defaults, read in one call so the page never adds anything up itself.
 * Server-only; the writes are in `settings-actions.ts`.
 */

export type DefaultField = "howToUse" | "lowStockAlert" | "returns";

export interface DefaultsEntry {
    howToUse: string | null;
    lowStockAlert: number | null;
    returnsMode: "STOREFRONT" | "OWN" | null;
    returnsText: string | null;
}

export interface DefaultsSuggestion {
    /** "all" or a category id. */
    key: string;
    field: "howToUse" | "lowStockAlert";
    value: string | number;
    count: number;
    total: number;
}

export interface CatalogueView {
    categories: {
        id: string;
        name: string;
        slug: string;
        parentId: string | null;
        productCount: number;
    }[];
    uncategorizedCount: number;
    options: {
        id: string;
        name: string;
        productCount: number;
        values: { id: string; value: string; variantCount: number }[];
    }[];
    defaults: {
        entries: Partial<Record<string, DefaultsEntry>>;
        stillOnDefault: Partial<Record<string, Record<DefaultField, number>>>;
        productCounts: Partial<Record<string, number>>;
        suggestions: DefaultsSuggestion[];
    };
    canWrite: boolean;
}

export function getCatalogue(storeId: string): Promise<CatalogueView | null> {
    return getJson<CatalogueView>(`/stores/${storeId}/catalogue`);
}

/** What a category took with it when it went, for Undo. */
export interface CategoryRemoval {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    movedTo: string | null;
    productIds: string[];
    defaults: {
        howToUse: string | null;
        lowStockAlert: number | null;
        returnsMode: string | null;
        returnsText: string | null;
    } | null;
    /** The custom fields shown for it; Undo shows them for it again. */
    fieldIds: string[];
}

export interface DefaultsSaveResult {
    entries: Record<string, DefaultsEntry>;
    previous: (DefaultsEntry & { key: string })[];
    updatedCount: number;
    updated: {
        products: {
            id: string;
            howToUse: string | null;
            returnsMode: string;
            returnsText: string | null;
        }[];
        stock: {
            kind: "product" | "variant";
            id: string;
            lowStockAlert: number;
        }[];
    };
}

export async function send<T>(
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
    const failure = toFailure(data, "That didn't save. Try again.");
    return { ...failure, field: failure.field as ResultField | undefined };
}

// ---- Defaults a new product starts with ----

/** What a product in a category starts with (Settings → Defaults). */
export interface EffectiveDefaults {
    howToUse: string | null;
    lowStockAlert: number;
    returns: { mode: "STOREFRONT" | "OWN"; text: string | null };
}

export function getEffectiveDefaults(
    storeId: string,
    categoryId: string | null,
): Promise<EffectiveDefaults | null> {
    const q = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : "";
    return getJson<EffectiveDefaults>(
        `/stores/${storeId}/catalogue/defaults/effective${q}`,
    );
}

// ---- SKU pattern (#484) ----

export interface SkuSettings {
    pattern: string;
    suggest: boolean;
    /** The product's number for {N}; the next one for a new product. */
    n: number;
}

export interface SkuPreview {
    rows: {
        productId: string;
        product: string;
        variant: string;
        now: string;
        next: string;
    }[];
    total: number;
    /** The first thing wrong with the pattern, clash included; "" if none. */
    problem: string;
}

export function getSkuSettings(
    storeId: string,
    productId?: string,
): Promise<SkuSettings | null> {
    const q = productId ? `?productId=${encodeURIComponent(productId)}` : "";
    return getJson<SkuSettings>(`/stores/${storeId}/sku-pattern${q}`);
}

export function getSkuPreview(
    storeId: string,
    pattern: string,
): Promise<SkuPreview | null> {
    return getJson<SkuPreview>(
        `/stores/${storeId}/sku-pattern/preview?pattern=${encodeURIComponent(pattern)}`,
    );
}

// ---- Custom fields (#482) ----

export type FieldType = "TEXT" | "NUMBER" | "DATE" | "YES_NO";

export interface FieldView {
    id: string;
    name: string;
    type: FieldType;
    onShop: boolean;
    position: number;
    categoryIds: string[];
    productCount: number;
}

export function listFields(storeId: string): Promise<FieldView[] | null> {
    return getJson<FieldView[]>(`/stores/${storeId}/fields`);
}

// ---- Allergens (#483) ----

export interface AllergenView {
    id: string;
    name: string;
    contains: number;
    mayContain: number;
}

export function listAllergens(storeId: string): Promise<AllergenView[] | null> {
    return getJson<AllergenView[]>(`/stores/${storeId}/allergens`);
}
