"use server";

import type { CrmResult } from "@/lib/api/http";
import { mutate } from "@/lib/api/http";

/**
 * Payments Server Actions for app.saroh.in (S5-004). The refund action calls the
 * existing S5-003 org-scoped refund endpoint (`payment:manage`); the amount is
 * derived server-side from the Order's SUCCEEDED intent — never supplied here.
 * The Order flips to REFUNDED only when the provider's refund webhook reconciles.
 */

export interface InitiateRefundResult {
    refundId: string;
    status: string;
}

/** Initiate a refund against an Order's successful payment. */
export async function refundOrder(
    orderId: string,
    reason?: string,
): Promise<CrmResult<InitiateRefundResult>> {
    return mutate<InitiateRefundResult>(
        `/orders/${orderId}/refund`,
        "POST",
        reason ? { reason } : {},
        "Couldn't start the refund.",
    );
}
