"use server";

import { revalidatePath } from "next/cache";

import { adminWrite } from "./control-plane";

/**
 * Admin › Billing's writes (DEC-166). Each needs `saroh-billing:act`, a
 * reason and the dialog's idempotency key; the API decides, records it on
 * the ledger and answers a retried request with its first answer.
 */

interface OperatorInput {
    reason: string;
    idempotencyKey: string;
}

function refreshBilling() {
    revalidatePath("/billing/actions");
    revalidatePath("/billing/subscriptions");
    revalidatePath("/billing/invoices");
    revalidatePath("/billing/events");
}

async function write<T>(path: string, body: unknown, fallback: string) {
    const result = await adminWrite<T>(path, "POST", body, fallback);
    if (result.ok) refreshBilling();
    return result;
}

/** Mark a Needs-action row resolved. */
export async function resolveBillingActionAction(
    input: OperatorInput & { id: string },
) {
    const { id, ...body } = input;
    return write<{ ok: true; changed: boolean }>(
        `/billing/actions/${encodeURIComponent(id)}/resolve`,
        body,
        "Could not mark it resolved.",
    );
}

/** End a business's autopay, keeping its paid period. */
export async function endAutopayAction(
    input: OperatorInput & { subscriptionId: string },
) {
    const { subscriptionId, ...body } = input;
    return write<{ ok: true; changed: boolean; effectiveAt: string | null }>(
        `/billing/subscriptions/${encodeURIComponent(subscriptionId)}/end-autopay`,
        body,
        "Could not end the autopay.",
    );
}

/** Ask the provider again about a double charge's refund. */
export async function recheckRefundAction(
    input: OperatorInput & { providerPaymentId: string },
) {
    const { providerPaymentId, ...body } = input;
    return write<{ ok: true; changed: boolean; already?: string }>(
        `/billing/refunds/${encodeURIComponent(providerPaymentId)}/recheck`,
        body,
        "Could not check the refund again.",
    );
}

/** Send the business's details to the provider's customer again. */
export async function syncCustomerAction(
    input: OperatorInput & { organizationId: string },
) {
    const { organizationId, ...body } = input;
    return write<{ ok: true; changed: boolean }>(
        `/billing/organizations/${encodeURIComponent(organizationId)}/customer/sync`,
        body,
        "Could not sync the customer.",
    );
}

/** Record a refund the owner made by hand against an invoice. */
export async function recordRefundAction(
    input: OperatorInput & {
        invoiceId: string;
        providerPaymentId: string;
        providerRefundId: string;
        amountPaise: number;
    },
) {
    const { invoiceId, ...body } = input;
    return write<{ ok: true; changed: boolean; refundId: string }>(
        `/billing/invoices/${encodeURIComponent(invoiceId)}/refunds`,
        body,
        "Could not record the refund.",
    );
}

/**
 * Run a failed billing job again (R28), through the console's one job
 * retry (`POST /admin/jobs/retry`, `jobs:retry`): the API checks the job
 * again, queues it, and records the reason. Billing's own pages are not
 * refreshed, so the row stays where it is and says it was queued.
 */
export async function retryBillingJobAction(
    input: OperatorInput & { jobId: string },
) {
    const { jobId, ...body } = input;
    const result = await adminWrite<{
        items: { targetId: string; status: string; detail: string | null }[];
    }>(
        "/jobs/retry",
        "POST",
        { ids: [jobId], ...body },
        "Could not run the job again.",
    );
    if (!result.ok) return result;
    revalidatePath("/operations/jobs");
    const item = result.data.items.find((i) => i.targetId === jobId);
    return {
        ok: true as const,
        data: {
            status: item?.status ?? "PENDING",
            detail: item?.detail ?? null,
        },
    };
}
