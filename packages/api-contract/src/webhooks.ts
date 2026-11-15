import { z } from "zod";

import { id } from "./common";

/**
 * Outbound webhooks (plan 2026-11-10-001, U13): the events Saroh sends to a
 * business's own server, and the workspace routes under
 * `organizations/:organizationId/webhooks` that manage where they go. The
 * management routes are not public, so not in the OpenAPI documents. More
 * events come later under the `/v1` additive rule; one is never renamed.
 */

export const WEBHOOK_EVENTS = [
    "booking.created",
    "booking.moved",
    "order.created",
    "order.paid",
    "order.status_changed",
    "customer.created",
    "enquiry.received",
] as const;
export const webhookEvent = z.enum(WEBHOOK_EVENTS);
export type WebhookEvent = z.infer<typeof webhookEvent>;

/** Deliveries in a row that run out of tries before Saroh switches an address off. */
export const WEBHOOK_AUTO_OFF_AFTER = 5;

/** What "Send a test" sends. Never subscribed to: every endpoint gets it on request. */
export const WEBHOOK_PING = "ping";

/** An https address on the standard port; the API also refuses private and local ones. */
export const webhookUrl = z
    .string()
    .trim()
    .max(2048)
    .refine((value) => /^https:\/\//i.test(value), {
        message: "Must be an https address",
    });

/** A name the business gives an address, like "Order sync". Empty clears it. */
export const webhookName = z
    .string()
    .trim()
    .max(80)
    .transform((v) => v || null);

export const createWebhookEndpointBody = z.strictObject({
    url: webhookUrl,
    name: webhookName.nullable().optional(),
    events: z.array(webhookEvent).min(1).max(WEBHOOK_EVENTS.length),
});
export type CreateWebhookEndpointBody = z.infer<
    typeof createWebhookEndpointBody
>;

export const updateWebhookEndpointBody = z.strictObject({
    url: webhookUrl.optional(),
    name: webhookName.nullable().optional(),
    events: z.array(webhookEvent).min(1).max(WEBHOOK_EVENTS.length).optional(),
    /** false switches it off; true switches it back on and clears its failure count. */
    enabled: z.boolean().optional(),
});
export type UpdateWebhookEndpointBody = z.infer<
    typeof updateWebhookEndpointBody
>;

export const webhookEndpointView = z.object({
    id,
    name: z.string().nullable(),
    url: z.string(),
    events: z.array(z.string()),
    enabled: z.boolean(),
    disabledAt: z.string().nullable(),
    failureStreak: z.number().int(),
    createdByUserId: id,
    /** Until when the secret a roll replaced still signs too. */
    previousSecretUntil: z.string().nullable(),
    /** When Saroh last tried to send to it, and how that went; null before the first try. */
    lastSent: z
        .object({
            at: z.string(),
            status: z.enum(["PENDING", "DELIVERED", "FAILED"]),
        })
        .nullable(),
    createdAt: z.string(),
});
export type WebhookEndpointView = z.infer<typeof webhookEndpointView>;

/** Made or rolled: the only answer that ever carries the signing secret. */
export const createdWebhookEndpoint = z.object({
    endpoint: webhookEndpointView,
    secret: z.string(),
});
export type CreatedWebhookEndpoint = z.infer<typeof createdWebhookEndpoint>;

export const webhookEndpointList = z.object({
    data: z.array(webhookEndpointView),
});
export type WebhookEndpointList = z.infer<typeof webhookEndpointList>;

export const webhookDeliveryView = z.object({
    id,
    endpointId: id,
    event: z.string(),
    status: z.enum(["PENDING", "DELIVERED", "FAILED"]),
    attempts: z.number().int(),
    lastStatusCode: z.number().int().nullable(),
    lastError: z.string().nullable(),
    /** The first 2 KB of the receiver's last answer. */
    responseSnippet: z.string().nullable(),
    lastAttemptAt: z.string().nullable(),
    deliveredAt: z.string().nullable(),
    createdAt: z.string(),
});
export type WebhookDeliveryView = z.infer<typeof webhookDeliveryView>;

export const webhookDeliveryList = z.object({
    data: z.array(webhookDeliveryView),
});
export type WebhookDeliveryList = z.infer<typeof webhookDeliveryList>;
