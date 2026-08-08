import { apiFetch, getJson, getList } from "@/lib/api/http";

import type { CreateStoreInput, StoreResult, UpdateStoreInput } from "./schema";

/**
 * Store data access for app.saroh.in. The app no longer touches the database
 * — every call forwards the request's session cookie to api.saroh.in (the
 * single backend) which enforces ownership and validation. The shared apiFetch
 * forwards the active org so the org-scoped create endpoint (B5: `POST /stores`
 * now requires it) can resolve + authorize the tenant; the owner-scoped
 * list/get/update ignore it, so sending it always is safe. Server-only:
 * imports next/headers (via the shared HTTP plumbing).
 */

export interface Store {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Stores the signed-in user owns (newest first). Empty when none; throws on
 * a real API/network failure (#101). */
export function listStores(): Promise<Store[]> {
    return getList<Store>("/stores");
}

/** The store if the user owns it; null otherwise (api 404 → no leak). */
export function getStore(storeId: string): Promise<Store | null> {
    return getJson<Store>(`/stores/${storeId}`);
}

async function mutate(
    path: string,
    method: "POST" | "PUT",
    input: CreateStoreInput | UpdateStoreInput,
): Promise<StoreResult<{ id: string }>> {
    const res = await apiFetch(path, { method, body: JSON.stringify(input) });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        message?: string;
        field?: "name" | "slug" | "logo";
    } | null;

    if (res.ok && data?.id) {
        return { ok: true, data: { id: data.id } };
    }
    return {
        ok: false,
        error: data?.message ?? "Something went wrong",
        field: data?.field,
    };
}

export function createStore(
    input: CreateStoreInput,
): Promise<StoreResult<{ id: string }>> {
    return mutate("/stores", "POST", input);
}

export function updateStore(
    storeId: string,
    input: UpdateStoreInput,
): Promise<StoreResult<{ id: string }>> {
    return mutate(`/stores/${storeId}`, "PUT", input);
}
