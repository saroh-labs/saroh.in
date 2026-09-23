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
    const data = (await res.json().catch(() => null)) as
        | (Record<string, unknown> & { message?: string; field?: ResultField })
        | null;
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return {
        ok: false,
        error:
            typeof data?.message === "string"
                ? data.message
                : "That didn't save. Try again.",
        field: data?.field,
    };
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
