import { headers } from "next/headers";

/**
 * Customers data access for app.saroh.in. Forwards the session cookie to
 * api.saroh.in (store membership enforced: read = access, write = owner/EDITOR+).
 * Server-only.
 */

const API_URL =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    "https://api.saroh.in";

export interface Customer {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    country: string | null;
    state: string | null;
    city: string | null;
    zipCode: string | null;
}

export interface CustomerInput {
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    country?: string | null;
    state?: string | null;
    city?: string | null;
    zipCode?: string | null;
}

export type CustomerResult =
    | { ok: true; data: { id: string } }
    | { ok: false; error: string; field?: "email" };

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

export async function listCustomers(storeId: string): Promise<Customer[]> {
    const res = await apiFetch(`/stores/${storeId}/customers`);
    if (!res.ok) return [];
    return (await res.json()) as Customer[];
}

export async function getCustomer(
    storeId: string,
    customerId: string,
): Promise<Customer | null> {
    const res = await apiFetch(`/stores/${storeId}/customers/${customerId}`);
    if (!res.ok) return null;
    return (await res.json()) as Customer;
}

async function mutate(
    path: string,
    method: "POST" | "PUT",
    body: unknown,
): Promise<CustomerResult> {
    const res = await apiFetch(path, { method, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        message?: string;
        field?: "email";
    } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return {
        ok: false,
        error: data?.message ?? "Something went wrong",
        field: data?.field,
    };
}

export function createCustomer(storeId: string, input: CustomerInput) {
    return mutate(`/stores/${storeId}/customers`, "POST", input);
}

export function updateCustomer(
    storeId: string,
    customerId: string,
    input: CustomerInput,
) {
    return mutate(`/stores/${storeId}/customers/${customerId}`, "PUT", input);
}
