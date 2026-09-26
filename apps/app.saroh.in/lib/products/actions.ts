"use server";

import type {
    CategoryInput,
    InventoryInput,
    NewProductInput,
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
    setProductSoldOut as setProductSoldOutApi,
    setProductStockTracking as setProductStockTrackingApi,
    setVariantStock as setVariantStockApi,
    updateCategory as updateCategoryApi,
    updateProduct as updateProductApi,
    updateVariant as updateVariantApi,
} from "./service";

/**
 * Server Actions for the catalog. Thin wrappers that forward the session cookie
 * to api.saroh.in; the api resolves the caller from the session and enforces
 * the business role. The UI calls these, never api directly. Products are the
 * business's (#531); a `storeId` names the storefront whose shelf or listing
 * the action is about.
 */

/** A new product, sold at `storeId`. */
export async function createProduct(storeId: string, input: NewProductInput) {
    return createProductApi(storeId, input);
}

export async function updateProduct(productId: string, input: ProductInput) {
    return updateProductApi(productId, input);
}

/** Delete it from the catalogue, and so from every storefront. */
export async function deleteProduct(productId: string) {
    return deleteProductApi(productId);
}

/** A category of the business (#529), made from any storefront's product. */
export async function createCategory(input: CategoryInput) {
    return createCategoryApi(input);
}

export async function updateCategory(categoryId: string, input: CategoryInput) {
    return updateCategoryApi(categoryId, input);
}

export async function deleteCategory(categoryId: string) {
    return deleteCategoryApi(categoryId);
}

export async function createVariant(productId: string, input: VariantInput) {
    return createVariantApi(productId, input);
}

export async function updateVariant(
    productId: string,
    variantId: string,
    input: VariantInput,
) {
    return updateVariantApi(productId, variantId, input);
}

export async function deleteVariant(productId: string, variantId: string) {
    return deleteVariantApi(productId, variantId);
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

/** Track stock on or off for a product (#515); Owner/Admin only. */
export async function setProductStockTracking(
    productId: string,
    tracked: boolean,
) {
    return setProductStockTrackingApi(productId, tracked);
}

/** Sold out by hand at one storefront, or available again (#515). */
export async function setProductSoldOut(
    productId: string,
    storefrontId: string,
    soldOut: boolean,
) {
    return setProductSoldOutApi(productId, storefrontId, soldOut);
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
    productId: string,
    images: ProductImageInput[],
) {
    return replaceProductImagesApi(productId, images);
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
