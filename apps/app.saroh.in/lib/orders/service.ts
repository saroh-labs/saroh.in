import { apiFetch, getJson, getList } from "@/lib/api/http";

/**
 * Orders data access for app.saroh.in. Forwards the session cookie to
 * api.saroh.in (store membership enforced). Money fields are decimal strings.
 * Server-only.
 */

export type OrderStatus =
    | "PENDING"
    | "PROCESSING"
    | "SHIPPED"
    | "DELIVERED"
    | "CANCELLED";
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
    subtotal: string;
    tax: string;
    shipping: string;
    discount: string;
    items: OrderItem[];
}

export interface CreateOrderInput {
    customerId: string;
    items: { productId: string; quantity: number }[];
    tax?: string;
    shipping?: string;
    discount?: string;
    currency?: string;
}

export interface UpdateOrderInput {
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
}

export type OrderResult =
    | { ok: true; data: { id: string } }
    | { ok: false; error: string };

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
    const data = (await res.json().catch(() => null)) as {
        id?: string;
        message?: string;
    } | null;
    if (res.ok && data?.id) return { ok: true, data: { id: data.id } };
    return { ok: false, error: data?.message ?? "Something went wrong" };
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
