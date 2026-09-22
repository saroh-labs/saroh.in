"use server";

import { revalidatePath } from "next/cache";

import type { StorefrontInput } from "./storefronts";
import {
    closeStorefront as closeStorefrontApi,
    updateStorefront as updateStorefrontApi,
} from "./storefronts";

/**
 * Server Actions for Sell → Storefronts.
 *
 * Thin: the API decides who may change or close a storefront and refuses
 * otherwise. A rename or a close revalidates the whole layout, because the
 * storefront switcher inside Products and Customers lists them by name.
 */

export async function updateStorefront(
    storeId: string,
    input: StorefrontInput,
) {
    const res = await updateStorefrontApi(storeId, input);
    if (res.ok) revalidatePath("/", "layout");
    return res;
}

export async function closeStorefront(storeId: string) {
    const res = await closeStorefrontApi(storeId);
    if (res.ok) revalidatePath("/", "layout");
    return res;
}
