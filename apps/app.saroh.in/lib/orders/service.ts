import { toFailure } from "@/lib/api/failure";
import { apiFetch } from "@/lib/api/http";

/**
 * One storefront's order writes for app.saroh.in: taking an order and
 * recording its status or a payment by hand. Forwards the session cookie to
 * api.saroh.in (store membership enforced). Server-only.
 *
 * Reads are elsewhere: the business-wide list in `business-service.ts`, and
 * one order in `kitchen-service.ts` — the organization-scoped read that leaves
 * money out for a role without a money read. This file's store-scoped read
 * did not, and was removed with Order Detail's move (U14).
 */

export type OrderStatus =
    "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PAID" | "FAILED" | "REFUNDED";

export interface CreateOrderInput {
    customerId: string;
    items: { productId: string; variantId?: string; quantity: number }[];
    tax?: string;
    shipping?: string;
    discount?: string;
    currency?: string;
    /** A discount code; the API works out what it takes off. */
    discountCode?: string;
}

export interface UpdateOrderInput {
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
}

export type OrderResult =
    | { ok: true; data: { id: string } }
    | { ok: false; error: string; field?: string };

async function mutate(
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
): Promise<OrderResult> {
    const res = await apiFetch(path, { method, body: JSON.stringify(body) });
    const data: unknown = await res.json().catch(() => null);
    const id = (data as { id?: unknown } | null)?.id;
    if (res.ok && typeof id === "string") return { ok: true, data: { id } };
    // The API's envelope is `{ error: { message, details } }`; reading only a
    // top-level `message` turned every refusal into "Something went wrong".
    return toFailure(data, "Something went wrong");
}

export function createOrder(storeId: string, input: CreateOrderInput) {
    return mutate(`/stores/${storeId}/orders`, "POST", input);
}

export function updateOrder(
    storeId: string,
    orderId: string,
    input: UpdateOrderInput,
) {
    return mutate(`/stores/${storeId}/orders/${orderId}`, "PATCH", input);
}
