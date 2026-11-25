"use server";

import type {
    CreateWebhookEndpointBody,
    UpdateWebhookEndpointBody,
} from "@saroh/api-contract";

import { writeAsOrg } from "@/lib/api/assert-active-org";

import * as webhooks from "./service";

/**
 * Server Actions for Notifications to your systems. Thin: the API checks
 * `webhook:manage`, the switch, the plan, the address (SSRF) and that each
 * event is one the person may read; its refusal comes back to be said.
 *
 * On React Query (DEC-259) a write takes the tab's business last
 * (`writeAsOrg`). A new or replaced signing secret is in its answer only.
 */

const as = <R>(orgId: string | undefined, write: () => Promise<R>) =>
    orgId ? writeAsOrg(orgId, write) : write();

export async function createWebhook(
    body: CreateWebhookEndpointBody,
    orgId?: string,
) {
    return as(orgId, () => webhooks.createWebhook(body));
}

export async function updateWebhook(
    id: string,
    body: UpdateWebhookEndpointBody,
    orgId?: string,
) {
    return as(orgId, () => webhooks.updateWebhook(id, body));
}

export async function removeWebhook(id: string, orgId?: string) {
    return as(orgId, () => webhooks.removeWebhook(id));
}

export async function rollWebhookSecret(id: string, orgId?: string) {
    return as(orgId, () => webhooks.rollWebhookSecret(id));
}

export async function testWebhook(id: string, orgId?: string) {
    return as(orgId, () => webhooks.testWebhook(id));
}

export async function resendDelivery(
    id: string,
    deliveryId: string,
    orgId?: string,
) {
    return as(orgId, () => webhooks.resendDelivery(id, deliveryId));
}

/** A read: the address's latest messages, when its sheet opens. */
export async function readDeliveries(id: string) {
    return webhooks.listDeliveries(id);
}
