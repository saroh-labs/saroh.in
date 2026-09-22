import type { CrmResult } from "@/lib/api/http";
import { apiFetch, getJson, getList, readError } from "@/lib/api/http";

/**
 * Customers data access for app.saroh.in. Forwards the session cookie to
 * api.saroh.in (store membership enforced: read = access, write = owner/EDITOR+).
 * Server-only.
 */

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

/**
 * A row of the customers list: the customer, plus the three facts the API
 * aggregates from their orders (see `customers/serialize.ts` there). They are
 * not stored on a customer — they are facts about Orders — so they arrive only
 * on the list, never on a single customer read.
 */
export interface CustomerListItem extends Customer {
    orderCount: number;
    /** What they have PAID, in `currency`; `null` when nothing has been. */
    spent: string | null;
    currency: string | null;
    /** Their payments span more than one currency, so `spent` is a subset. */
    mixedCurrency: boolean;
    /** ISO date of their last order, paid or not; `null` if they never have. */
    lastOrderAt: string | null;
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

export function listCustomers(storeId: string): Promise<CustomerListItem[]> {
    return getList<CustomerListItem>(`/stores/${storeId}/customers`);
}

export function getCustomer(
    storeId: string,
    customerId: string,
): Promise<Customer | null> {
    return getJson<Customer>(`/stores/${storeId}/customers/${customerId}`);
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

/**
 * Delete a customer who has never ordered. One with orders is refused by the
 * API (an order keeps who bought it), and its reason comes back as the error.
 */
export async function deleteCustomer(
    storeId: string,
    customerId: string,
): Promise<CrmResult<{ id: string }>> {
    const res = await apiFetch(`/stores/${storeId}/customers/${customerId}`, {
        method: "DELETE",
    });
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        message?: string;
        error?: string | { message?: string };
    } | null;
    if (res.ok) return { ok: true, data: { id: customerId } };
    return {
        ok: false,
        error: readError(data, "Could not delete the customer"),
    };
}
