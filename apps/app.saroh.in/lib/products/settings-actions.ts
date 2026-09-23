"use server";

import type {
    CategoryRemoval,
    DefaultsEntry,
    DefaultsSaveResult,
    SkuSettings,
} from "./settings";
import { getSkuPreview, send } from "./settings";

/**
 * Server Actions for Product settings. Each change that takes effect at
 * once returns what Undo needs to send the reverse call; the API guards who
 * may make it and refuses what would orphan something (a category a
 * discount reaches, a value a variant uses).
 */

const base = (storeId: string) => `/stores/${encodeURIComponent(storeId)}`;

// ---- Categories ----

export async function addCategory(storeId: string, name: string) {
    return send<{ id: string }>(`${base(storeId)}/categories`, "POST", {
        name,
    });
}

export async function renameCategory(
    storeId: string,
    categoryId: string,
    name: string,
) {
    return send<{ id: string; name: string; previousName: string }>(
        `${base(storeId)}/categories/${encodeURIComponent(categoryId)}`,
        "PATCH",
        { name },
    );
}

export async function mergeCategory(
    storeId: string,
    categoryId: string,
    intoId: string | null,
) {
    return send<CategoryRemoval>(
        `${base(storeId)}/categories/${encodeURIComponent(categoryId)}/merge`,
        "POST",
        { intoId },
    );
}

export async function removeCategory(storeId: string, categoryId: string) {
    return send<CategoryRemoval>(
        `${base(storeId)}/categories/${encodeURIComponent(categoryId)}`,
        "DELETE",
    );
}

/** Undo of a merge or delete: the category back, and its products in it. */
export async function restoreCategory(
    storeId: string,
    removal: CategoryRemoval,
) {
    return send<{ id: string; moved: number }>(
        `${base(storeId)}/categories/restore`,
        "POST",
        {
            name: removal.name,
            slug: removal.slug,
            parentId: removal.parentId,
            movedTo: removal.movedTo,
            productIds: removal.productIds,
            defaults: removal.defaults,
        },
    );
}

// ---- Options ----

export async function addOption(
    storeId: string,
    name: string,
    values?: string[],
) {
    return send<{ id: string }>(`${base(storeId)}/options`, "POST", {
        name,
        ...(values ? { values } : {}),
    });
}

export async function renameOption(
    storeId: string,
    optionId: string,
    name: string,
) {
    return send<{ id: string; name: string; previousName: string }>(
        `${base(storeId)}/options/${encodeURIComponent(optionId)}`,
        "PATCH",
        { name },
    );
}

export async function removeOption(storeId: string, optionId: string) {
    return send<{ id: string; name: string; values: string[] }>(
        `${base(storeId)}/options/${encodeURIComponent(optionId)}`,
        "DELETE",
    );
}

export async function addOptionValue(
    storeId: string,
    optionId: string,
    value: string,
) {
    return send<{ id: string; value: string }>(
        `${base(storeId)}/options/${encodeURIComponent(optionId)}/values`,
        "POST",
        { value },
    );
}

export async function removeOptionValue(
    storeId: string,
    optionId: string,
    valueId: string,
) {
    return send<{ id: string; value: string }>(
        `${base(storeId)}/options/${encodeURIComponent(optionId)}/values/${encodeURIComponent(valueId)}`,
        "DELETE",
    );
}

// ---- Defaults ----

export async function saveDefaults(
    storeId: string,
    entries: (DefaultsEntry & { key: string })[],
    updateExisting: boolean,
) {
    return send<DefaultsSaveResult>(
        `${base(storeId)}/catalogue/defaults`,
        "PUT",
        { entries, updateExisting },
    );
}

export async function undoDefaults(storeId: string, saved: DefaultsSaveResult) {
    return send<{ ok: true }>(
        `${base(storeId)}/catalogue/defaults/undo`,
        "POST",
        {
            entries: saved.previous,
            products: saved.updated.products,
            stock: saved.updated.stock,
        },
    );
}

// ---- SKU pattern ----

/** The preview as the pattern is typed; null when it could not be read. */
export async function previewSkuPattern(storeId: string, pattern: string) {
    return getSkuPreview(storeId, pattern);
}

export async function saveSkuPattern(
    storeId: string,
    pattern: string,
    suggest: boolean,
) {
    return send<SkuSettings>(`${base(storeId)}/sku-pattern`, "PUT", {
        pattern,
        suggest,
    });
}
