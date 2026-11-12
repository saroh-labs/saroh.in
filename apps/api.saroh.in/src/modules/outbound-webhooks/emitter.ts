import type { WebhookEvent } from "@saroh/api-contract";
import type { Prisma } from "@saroh/database";

import type { OrgAction } from "../organizations/organization-actions";

/**
 * The outbound webhooks' outbox (plan 2026-11-10-001, U13). A write that
 * makes one of the v1 events calls {@link emitWebhook} on its own
 * transaction, beside the create or the transition, so a committed change
 * always has its deliveries queued and a rolled-back one has none
 * (`data-export.service.ts`'s `tx.job.create`). One `WebhookDelivery` and
 * one `webhooks.deliver` job per endpoint of the business that is on and
 * subscribed to the event; none at all for a business with no endpoints,
 * which costs one indexed read.
 *
 * The delivery carries the record's id only: the job builds the body the
 * first time it runs, after the commit, through the `/v1` views (so never
 * a `customer:sensitive` field) and keeps it, so every retry and resend
 * sends the same event. Imports never emit (`emit-coverage.spec.ts`).
 */

export const WEBHOOK_DELIVER_TYPE = "webhooks.deliver";

/** Tries per delivery before it is FAILED; the worker backs off between them. */
export const WEBHOOK_DELIVER_ATTEMPTS = 8;

/** What a subscriber must be able to read, as the `/v1` read of the record does. */
export const EVENT_CAPABILITY: Record<WebhookEvent, OrgAction> = {
    "booking.created": "booking:read",
    "booking.moved": "booking:read",
    "order.created": "order:read",
    "order.paid": "order:read",
    "order.status_changed": "order:read",
    "customer.created": "contact:read",
    "enquiry.received": "lead:read",
};

type EmitTx = Pick<
    Prisma.TransactionClient,
    "webhookEndpoint" | "webhookDelivery" | "job"
>;

export interface EmittedEvent {
    organizationId: string | null;
    type: WebhookEvent;
    /** The booking, order, customer (contact) or enquiry (lead). */
    id: string;
}

/** Queue `event` for every endpoint of its business that wants it. */
export async function emitWebhook(
    tx: EmitTx,
    event: EmittedEvent,
): Promise<number> {
    const { organizationId } = event;
    // An order from before ADR-001 names no business: nobody to tell.
    if (!organizationId) return 0;
    const endpoints = await tx.webhookEndpoint.findMany({
        where: {
            organizationId,
            disabledAt: null,
            events: { has: event.type },
        },
        select: { id: true },
    });
    for (const endpoint of endpoints) {
        await queueDelivery(tx, {
            organizationId,
            endpointId: endpoint.id,
            event: event.type,
            payload: { ref: event.id },
        });
    }
    return endpoints.length;
}

/**
 * {@link emitWebhook} for an order, when the caller has its id but not its
 * business (a payment's or a step's shared helper).
 */
export async function emitOrderWebhook(
    tx: EmitTx & Pick<Prisma.TransactionClient, "order">,
    type: Extract<WebhookEvent, `order.${string}`>,
    orderId: string,
): Promise<number> {
    const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { organizationId: true },
    });
    return emitWebhook(tx, {
        organizationId: order?.organizationId ?? null,
        type,
        id: orderId,
    });
}

/** One delivery and the job that sends it. */
export async function queueDelivery(
    tx: Pick<Prisma.TransactionClient, "webhookDelivery" | "job">,
    d: {
        organizationId: string;
        endpointId: string;
        event: string;
        payload: Prisma.InputJsonValue;
    },
): Promise<string> {
    const delivery = await tx.webhookDelivery.create({
        data: d,
        select: { id: true },
    });
    await tx.job.create({
        data: {
            organizationId: d.organizationId,
            type: WEBHOOK_DELIVER_TYPE,
            payload: { deliveryId: delivery.id },
            maxAttempts: WEBHOOK_DELIVER_ATTEMPTS,
        },
    });
    return delivery.id;
}
