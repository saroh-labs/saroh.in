import { headers } from "next/headers";

import { env } from "@/env";

import type { CreateStoreInput, StoreResult, UpdateStoreInput } from "./schema";

/**
 * Store data access for app.saroh.in. The app no longer touches the database
 * — every call forwards the request's session cookie to api.saroh.in (the
 * single backend) which enforces ownership and validation. Server-only:
 * imports next/headers, so it must never reach a client component.
 */

const API_URL =
    env.API_URL ??
    env.NEXT_PUBLIC_API_URL ??
    env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "https://api.saroh.in";

export interface Store {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    logo: string | null;
    createdAt: string;
    updatedAt: string;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
    const cookie = (await headers()).get("cookie") ?? "";
    return fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
            "content-type": "application/json",
            cookie,
            ...(init?.headers ?? {}),
        },
        cache: "no-store",
    });
}

/** Stores the signed-in user owns (newest first). Empty on any failure. */
export async function listStores(): Promise<Store[]> {
    const res = await apiFetch("/stores");
    if (!res.ok) return [];
    return (await res.json()) as Store[];
}

/** The store if the user owns it; null otherwise (api 404 → no leak). */
export async function getStore(storeId: string): Promise<Store | null> {
    const res = await apiFetch(`/stores/${storeId}`);
    if (!res.ok) return null;
    return (await res.json()) as Store;
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
