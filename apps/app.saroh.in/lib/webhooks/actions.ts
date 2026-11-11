"use server";

import type {
    CreateWebhookEndpointBody,
    UpdateWebhookEndpointBody,
} from "@saroh/api-contract";

import * as webhooks from "./service";

/**
 * Server Actions for Notifications to your systems. Thin: the API checks
 * `webhook:manage`, the switch, the plan, the address (SSRF) and that each
 * event is one the person may read; its refusal comes back to be said.
 */

export async function createWebhook(body: CreateWebhookEndpointBody) {
    return webhooks.createWebhook(body);
}

export async function updateWebhook(
    id: string,
    body: UpdateWebhookEndpointBody,
) {
    return webhooks.updateWebhook(id, body);
}

export async function removeWebhook(id: string) {
    return webhooks.removeWebhook(id);
}

export async function rollWebhookSecret(id: string) {
    return webhooks.rollWebhookSecret(id);
}

export async function testWebhook(id: string) {
    return webhooks.testWebhook(id);
}

export async function resendDelivery(id: string, deliveryId: string) {
    return webhooks.resendDelivery(id, deliveryId);
}

/** A read: the address's latest messages, when its sheet opens. */
export async function readDeliveries(id: string) {
    return webhooks.listDeliveries(id);
}
