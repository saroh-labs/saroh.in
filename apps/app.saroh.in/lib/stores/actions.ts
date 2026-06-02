"use server";

import { requireSession } from "@/lib/session";

import type { StoreResult } from "./schema";
import { createStoreForUser, updateStoreForUser } from "./service";

/**
 * Server Actions for store mutations. They resolve the user from the accounts
 * session server-side (never trust a client-passed userId) and delegate to the
 * data layer. Confined here so store CRUD can later move behind api.saroh.in
 * without touching the UI.
 */

export async function createStore(
    input: unknown,
): Promise<StoreResult<{ id: string }>> {
    const session = await requireSession();
    return createStoreForUser(session.user.id, input);
}

export async function updateStore(
    storeId: string,
    input: unknown,
): Promise<StoreResult<{ id: string }>> {
    const session = await requireSession();
    return updateStoreForUser(session.user.id, storeId, input);
}
