import type { CrmResult } from "@/lib/api/http";
import { apiFetch, mutate, orgBase } from "@/lib/api/http";

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

/** A refund the API made or found, as the app reads it. */
export interface MismatchRefund {
    refundId: string;
    amountCents: number;
    currency: string;
    status: string;
}

/**
 * Refund a payment the provider took at a different amount than asked
 * (PAY-06): exactly what it took goes back, through the business's
 * provider (`POST …/payment-attempts/:attemptId/refund`, `order:refund`).
 * The order or invoice it was for is left as it is. Server-only.
 */
export function refundPaymentAttempt(
    attemptId: string,
): Promise<CrmResult<MismatchRefund>> {
    return mutate<MismatchRefund>(
        `/payment-attempts/${encodeURIComponent(attemptId)}/refund`,
        "POST",
        {},
        "The refund couldn't be sent.",
    );
}
