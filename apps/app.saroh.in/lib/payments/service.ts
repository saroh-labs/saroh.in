import { apiFetch, orgBase } from "@/lib/crm/http";

/**
 * Org-scoped payments data access for app.saroh.in (S5-004). Reads the owner
 * payments summary for an Order via the authed, org-scoped endpoint
 * (`GET /organizations/:orgId/orders/:orderId/payments`, `payment:read`). Uses
 * the shared CRM HTTP plumbing (active-org cookie → path + `x-organization-id`
 * header, session cookie forwarded). Server-only. The app never imports
 * @saroh/database — this reaches data only through the API.
 */

export interface OrderPaymentAttempt {
    id: string;
    provider: string;
    providerRef: string | null;
    status: string;
    createdAt: string;
}

export interface OrderPaymentRefund {
    id: string;
    status: string;
    amountCents: number;
    currency: string;
    providerRefundId: string | null;
    reason: string | null;
    createdAt: string;
}

export interface OrderPaymentIntent {
    id: string;
    provider: string;
    providerIntentId: string | null;
    status: string;
    amountCents: number;
    currency: string;
    createdAt: string;
    attempts: OrderPaymentAttempt[];
    refunds: OrderPaymentRefund[];
}

export interface OrderPaymentsSummary {
    orderId: string;
    paymentStatus: string;
    total: string;
    currency: string;
    intents: OrderPaymentIntent[];
}

/**
 * Fetch the payments summary (intents + attempts + refunds) for an Order in the
 * active org. Returns null when no org is active or the read fails (the caller
 * renders an empty state) — the store-scoped order page still works without it.
 */
export async function getOrderPayments(
    orderId: string,
): Promise<OrderPaymentsSummary | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/orders/${orderId}/payments`);
    if (!res.ok) return null;
    return (await res.json()) as OrderPaymentsSummary;
}
