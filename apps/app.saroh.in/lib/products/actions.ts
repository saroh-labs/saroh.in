"use server";

import type {
    CategoryInput,
    InventoryInput,
    ProductImageInput,
    ProductInput,
    ProductPatch,
    Result,
    VariantInput,
} from "./service";
import {
    createCategory as createCategoryApi,
    createProduct as createProductApi,
    createVariant as createVariantApi,
    deleteCategory as deleteCategoryApi,
    deleteProduct as deleteProductApi,
    deleteVariant as deleteVariantApi,
    patchProduct as patchProductApi,
    reorderVariants as reorderVariantsApi,
    replaceProductImages as replaceProductImagesApi,
    setInventory as setInventoryApi,
    setVariantStock as setVariantStockApi,
    updateCategory as updateCategoryApi,
    updateProduct as updateProductApi,
    updateVariant as updateVariantApi,
} from "./service";

/**
 * Server Actions for the catalog. Thin wrappers that forward the session cookie
 * to api.saroh.in; the api resolves the caller from the session and enforces
 * store membership + write role. The UI calls these, never api directly.
 */

export async function createProduct(storeId: string, input: ProductInput) {
    return createProductApi(storeId, input);
}

export async function updateProduct(
    storeId: string,
    productId: string,
    input: ProductInput,
) {
    return updateProductApi(storeId, productId, input);
}

export async function deleteProduct(storeId: string, productId: string) {
    return deleteProductApi(storeId, productId);
}

export async function createCategory(storeId: string, input: CategoryInput) {
    return createCategoryApi(storeId, input);
}

export async function updateCategory(
    storeId: string,
    categoryId: string,
    input: CategoryInput,
) {
    return updateCategoryApi(storeId, categoryId, input);
}

export async function deleteCategory(storeId: string, categoryId: string) {
    return deleteCategoryApi(storeId, categoryId);
}

export async function createVariant(
    storeId: string,
    productId: string,
    input: VariantInput,
) {
    return createVariantApi(storeId, productId, input);
}

export async function updateVariant(
    storeId: string,
    productId: string,
    variantId: string,
    input: VariantInput,
) {
    return updateVariantApi(storeId, productId, variantId, input);
}

export async function deleteVariant(
    storeId: string,
    productId: string,
    variantId: string,
) {
    return deleteVariantApi(storeId, productId, variantId);
}

export async function setInventory(
    storeId: string,
    productId: string,
    input: InventoryInput,
): Promise<
    Result<{ quantity: number; reserved: number; lowStockAlert: number }>
> {
    return setInventoryApi(storeId, productId, input);
}

/** One section of a product; the API judges the whole product after it. */
export async function patchProduct(
    storeId: string,
    productId: string,
    patch: ProductPatch,
) {
    return patchProductApi(storeId, productId, patch);
}

export async function replaceProductImages(
    storeId: string,
    productId: string,
    images: ProductImageInput[],
) {
    return replaceProductImagesApi(storeId, productId, images);
}

export async function setVariantStock(
    storeId: string,
    productId: string,
    variants: { variantId: string; quantity: number; lowStockAlert: number }[],
) {
    return setVariantStockApi(storeId, productId, variants);
}

export async function reorderVariants(
    storeId: string,
    productId: string,
    ids: string[],
) {
    return reorderVariantsApi(storeId, productId, ids);
}
