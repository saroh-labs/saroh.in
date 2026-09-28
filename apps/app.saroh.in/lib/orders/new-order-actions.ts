"use server";

import type { NewOrderInput } from "./new-order-service";
import {
    createNewOrder,
    loadNewOrderCatalogue,
    readNewOrderLines,
} from "./new-order-service";

/** Server Actions for New order v2 (B13); the API authorizes each. */

/** A storefront's products, currency and tax, as the sheet lists them. */
export async function loadNewOrder(storeId: string) {
    return loadNewOrderCatalogue(storeId).catch(() => null);
}

/** The ways these lines can leave, and their allergens. */
export async function newOrderLines(storeId: string, productIds: string[]) {
    return readNewOrderLines(storeId, productIds).catch(() => null);
}

/** Make the order; a pay link, if asked for, comes back this once. */
export async function makeNewOrder(storeId: string, input: NewOrderInput) {
    return createNewOrder(storeId, input);
}
