"use server";

import { revalidatePath } from "next/cache";

import { writeAsOrg } from "@/lib/api/assert-active-org";

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
    // workspace, so every page is read again.
    // rq-revalidate-ok: from New location, which is server-rendered.
    if (res.ok) revalidatePath("/", "layout");
    return res;
}

/** From Sell › Locations: the tab's business last (`writeAsOrg`). */
export async function updateStore(
    storeId: string,
    input: UpdateStoreInput,
    orgId: string,
) {
    return writeAsOrg(orgId, () => updateStoreApi(storeId, input));
}
