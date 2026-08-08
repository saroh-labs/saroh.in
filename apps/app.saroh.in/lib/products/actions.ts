"use server";

import type {
    CategoryInput,
    InventoryInput,
    ProductInput,
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
    setInventory as setInventoryApi,
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
