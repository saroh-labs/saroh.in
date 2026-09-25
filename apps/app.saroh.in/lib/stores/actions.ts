"use server";

import { revalidatePath } from "next/cache";

import type { CreateStoreInput, StoreResult, UpdateStoreInput } from "./schema";
import {
    createStore as createStoreApi,
    updateStore as updateStoreApi,
} from "./service";

/**
 * Server Actions for store mutations. They post to api.saroh.in, forwarding
 * the session cookie; the api resolves the user from the session (never a
 * client-passed id) and enforces ownership. Thin wrappers so the UI is
 * decoupled from where the data lives.
 */

export async function createStore(
    input: CreateStoreInput,
): Promise<StoreResult<{ id: string }>> {
    const res = await createStoreApi(input);
    // A second storefront brings pickers and "Storefronts" into the whole
    // workspace, so every page is read again, as a close does.
    if (res.ok) revalidatePath("/", "layout");
    return res;
}

export async function updateStore(
    storeId: string,
    input: UpdateStoreInput,
): Promise<StoreResult<{ id: string }>> {
    return updateStoreApi(storeId, input);
}
