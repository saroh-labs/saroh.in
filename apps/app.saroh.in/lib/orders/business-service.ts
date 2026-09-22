import { getJson, orgBase } from "@/lib/api/http";

/**
 * Orders across the whole business — the read behind Sell → Orders.
 *
 * Separate from `lib/orders/service.ts`, which reads one storefront's orders
 * for the screens inside a storefront. The two answer different questions and
 * are scoped by different things (a store id in the path there, the active
 * organization here), so they stay apart rather than sharing a function with a
 * nullable argument that silently decides which tenant boundary applies.
 *
 * Server-only: `orgBase` reads the active-org cookie.
 */

/**
 * What the status column says.
 *
 * Resolved by the API from an order's two independent states — where the goods
 * are and where the money is — so every surface that lists orders agrees about
 * precedence instead of each re-deriving it. See `order-standing.ts` there.
 */
export type OrderStanding =
    "UNFULFILLED" | "FULFILLED" | "REFUNDED" | "CANCELLED";

export interface BusinessOrder {
    id: string;
    /** The storefront's own order number, e.g. "1042". */
    orderId: string;
    standing: OrderStanding;
    total: string;
    currency: string;
    /** ISO; rendered in the viewer's timezone, never the server's. */
    placedAt: string;
    itemCount: number;
    store: { id: string; name: string };
    customer: { id: string; name: string | null; email: string } | null;
}

/**
 * Every order in the business, newest first.
 *
 * Empty on no active organization rather than throwing: this is reached from
 * the rail, and someone whose organization went away mid-session should see an
 * empty list, not the error boundary.
 */
export async function listBusinessOrders(): Promise<BusinessOrder[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<BusinessOrder[]>(`${base}/orders`)) ?? [];
}
