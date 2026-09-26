"use server";

import type {
    AllergenView,
    CategoryRemoval,
    DefaultsEntry,
    DefaultsSaveResult,
    FieldType,
    FieldView,
    SkuSettings,
} from "./settings";
import { getEffectiveDefaults, getSkuPreview, send } from "./settings";

/**
 * Server Actions for Product settings — the business's (#529), so none
 * takes a storefront: `send` addresses the active business's catalogue.
 * Each change that takes effect at once returns what Undo needs to send the
 * reverse call; the API guards who may make it and refuses what would orphan
 * something (a category a discount reaches, a value a variant uses).
 */

// ---- Categories ----

export async function addCategory(name: string) {
    return send<{ id: string }>(`/categories`, "POST", {
        name,
    });
}

export async function renameCategory(categoryId: string, name: string) {
    return send<{ id: string; name: string; previousName: string }>(
        `/categories/${encodeURIComponent(categoryId)}`,
        "PATCH",
        { name },
    );
}

export async function mergeCategory(categoryId: string, intoId: string | null) {
    return send<CategoryRemoval>(
        `/categories/${encodeURIComponent(categoryId)}/merge`,
        "POST",
        { intoId },
    );
}

export async function removeCategory(categoryId: string) {
    return send<CategoryRemoval>(
        `/categories/${encodeURIComponent(categoryId)}`,
        "DELETE",
    );
}

/** Undo of a merge or delete: the category back, and its products in it. */
export async function restoreCategory(removal: CategoryRemoval) {
    return send<{ id: string; moved: number }>(`/categories/restore`, "POST", {
        name: removal.name,
        slug: removal.slug,
        parentId: removal.parentId,
        movedTo: removal.movedTo,
        productIds: removal.productIds,
        defaults: removal.defaults,
        fieldIds: removal.fieldIds,
    });
}

// ---- Options ----

export async function addOption(name: string, values?: string[]) {
    return send<{ id: string }>(`/options`, "POST", {
        name,
        ...(values ? { values } : {}),
    });
}

export async function renameOption(optionId: string, name: string) {
    return send<{ id: string; name: string; previousName: string }>(
        `/options/${encodeURIComponent(optionId)}`,
        "PATCH",
        { name },
    );
}

export async function removeOption(optionId: string) {
    return send<{ id: string; name: string; values: string[] }>(
        `/options/${encodeURIComponent(optionId)}`,
        "DELETE",
    );
}

export async function addOptionValue(optionId: string, value: string) {
    return send<{ id: string; value: string }>(
        `/options/${encodeURIComponent(optionId)}/values`,
        "POST",
        { value },
    );
}

export async function removeOptionValue(optionId: string, valueId: string) {
    return send<{ id: string; value: string }>(
        `/options/${encodeURIComponent(optionId)}/values/${encodeURIComponent(valueId)}`,
        "DELETE",
    );
}

// ---- Defaults ----

export async function saveDefaults(
    entries: (DefaultsEntry & { key: string })[],
    updateExisting: boolean,
) {
    return send<DefaultsSaveResult>(`/catalogue/defaults`, "PUT", {
        entries,
        updateExisting,
    });
}

export async function undoDefaults(saved: DefaultsSaveResult) {
    return send<{ ok: true }>(`/catalogue/defaults/undo`, "POST", {
        entries: saved.previous,
        products: saved.updated.products,
        stock: saved.updated.stock,
    });
}

/** The editor's prefill when a new product's category changes. */
export async function effectiveDefaults(categoryId: string | null) {
    return getEffectiveDefaults(categoryId);
}

// ---- SKU pattern ----

/** The preview as the pattern is typed; null when it could not be read. */
export async function previewSkuPattern(pattern: string) {
    return getSkuPreview(pattern);
}

export async function saveSkuPattern(pattern: string, suggest: boolean) {
    return send<SkuSettings>(`/sku-pattern`, "PUT", {
        pattern,
        suggest,
    });
}

// ---- Custom fields ----

export async function addField(name: string, type: FieldType) {
    return send<FieldView>(`/fields`, "POST", { name, type });
}

export async function updateField(
    fieldId: string,
    patch: { name?: string; onShop?: boolean; categoryIds?: string[] },
) {
    return send<FieldView>(
        `/fields/${encodeURIComponent(fieldId)}`,
        "PATCH",
        patch,
    );
}

/** Soft: the values stay, and Undo restores it. */
export async function removeField(fieldId: string) {
    return send<{ id: string; name: string }>(
        `/fields/${encodeURIComponent(fieldId)}`,
        "DELETE",
    );
}

export async function restoreField(fieldId: string) {
    return send<FieldView>(
        `/fields/${encodeURIComponent(fieldId)}/restore`,
        "POST",
    );
}

// ---- Allergens ----

/** One typed by hand, or the common food list at once. */
export async function addAllergens(names: string[]) {
    return send<AllergenView[]>(`/allergens`, "POST", {
        names,
    });
}

/** Refused while any product lists it. */
export async function removeAllergen(allergenId: string) {
    return send<{ id: string; name: string }>(
        `/allergens/${encodeURIComponent(allergenId)}`,
        "DELETE",
    );
}
