import { toFailure } from "@/lib/api/failure";
import { apiFetch, getJson, getList } from "@/lib/api/http";

/**
 * Orders data access for app.saroh.in. Forwards the session cookie to
 * api.saroh.in (store membership enforced). Money fields are decimal strings.
 * Server-only.
 */

export type OrderStatus =
    "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PAID" | "FAILED" | "REFUNDED";

export interface OrderSummary {
    id: string;
    orderId: string;
    customerId: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    total: string;
    currency: string;
    createdAt: string;
    customer?: {
        email: string;
        firstName: string | null;
        lastName: string | null;
    } | null;
}

export interface OrderItem {
    id: string;
    productId: string;
    quantity: number;
    price: string;
    product?: { name: string } | null;
}

export interface OrderDetail extends OrderSummary {
    /** When anything on the order last changed. */
    updatedAt: string | null;
    subtotal: string;
    tax: string;
    shipping: string;
    discount: string;
    items: OrderItem[];
    /** The code used, as it was when used — never the code as it is now. */
    discountCode: { code: string; rule: string } | null;
}

export interface CreateOrderInput {
    customerId: string;
    items: { productId: string; quantity: number }[];
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

export function listOrders(storeId: string): Promise<OrderSummary[]> {
    return getList<OrderSummary>(`/stores/${storeId}/orders`);
}

export function getOrder(
    storeId: string,
    orderId: string,
): Promise<OrderDetail | null> {
    return getJson<OrderDetail>(`/stores/${storeId}/orders/${orderId}`);
}

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
