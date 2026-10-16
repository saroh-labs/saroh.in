import { unstable_rethrow } from "next/navigation";

import { ApiError } from "@/lib/api/errors";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, getActiveOrgId, getJson, getList } from "@/lib/api/http";

import type { BusinessStore } from "./business-stores";
import { fromStorefronts, ownInBusiness } from "./business-stores";
import type { CreateStoreInput, StoreResult, UpdateStoreInput } from "./schema";
import type { StorefrontSummary } from "./storefronts";

export type { BusinessStore } from "./business-stores";

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
    description: string | null;
    logo: string | null;
    /** Its business; `GET /stores` spans every business the person is in. */
    organizationId?: string;
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
    const data: unknown = await res.json().catch(() => null);
    const id = (data as { id?: unknown } | null)?.id;
    if (res.ok && typeof id === "string") {
        return { ok: true, data: { id } };
    }
    const failure = toFailure(data, "That didn't go through. Try again.");
    const field = failure.field;
    return {
        ok: false,
        error: failure.error,
        field: field === "name" || field === "logo" ? field : undefined,
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

/**
 * The ACTIVE business's locations, for every role (16 Oct audit, SEV 4).
 *
 * Read from the business's storefronts (`GET /organizations/:org/
 * storefronts`, `store:read`), which the API scopes to the active business
 * itself. It used to start from `GET /stores`, the locations the signed-in
 * person OWNS, so an Admin or a Member was told "No locations yet" and
 * "Product not found". Who may change anything is the permissions' answer
 * (`store:write`, `inventory:write`) and the API's, never ownership.
 *
 * A role that can't read the business's locations (no `store:read`) still
 * sees the ones it was invited to: `GET /stores`, kept to this business.
 *
 * THROWS when the locations can't be read, so a caller says "Couldn't
 * load your locations" rather than "No locations yet"; `readBusinessStores`
 * is the same read as a value.
 */
export async function listBusinessStores(): Promise<BusinessStore[]> {
    const organizationId = await getActiveOrgId();
    if (!organizationId) return [];
    const path = `/organizations/${organizationId}/storefronts`;
    const res = await apiFetch(path);
    if (res.ok) {
        return fromStorefronts((await res.json()) as StorefrontSummary[]);
    }
    if (res.status === 403) {
        return ownInBusiness(await listStores(), organizationId);
    }
    if (res.status === 404) return [];
    throw new ApiError(res.status, `GET ${path}`);
}

/**
 * `listBusinessStores()`, with a failed read as `null` for the page to say
 * so. A redirect or a `forbidden()` from the read still goes through.
 */
export async function readBusinessStores(): Promise<BusinessStore[] | null> {
    try {
        return await listBusinessStores();
    } catch (error) {
        unstable_rethrow(error);
        return null;
    }
}
