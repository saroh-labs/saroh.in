import type {
    CreatedWebhookEndpoint,
    CreateWebhookEndpointBody,
    UpdateWebhookEndpointBody,
    WebhookDeliveryList,
    WebhookDeliveryView,
    WebhookEndpointList,
    WebhookEndpointView,
} from "@saroh/api-contract";

import type { CrmResult } from "@/lib/api/http";
import { apiFetch, destroy, getJson, mutate, orgBase } from "@/lib/api/http";

/**
 * Settings › API and AI apps › Notifications to your systems (webhooks):
 * `organizations/:org/webhooks`. Server-only. The list is the tab's
 * required read (a failure throws to `error.tsx`); an address's delivery
 * log is read when its sheet opens.
 */

const path = (id: string) => `/webhooks/${encodeURIComponent(id)}`;

export async function listWebhooks(): Promise<WebhookEndpointView[]> {
    const base = await orgBase();
    if (!base) return [];
    const list = await getJson<WebhookEndpointList>(`${base}/webhooks`);
    return list?.data ?? [];
}

/** The latest messages to one address; null when it couldn't be read. */
export async function listDeliveries(
    id: string,
): Promise<WebhookDeliveryView[] | null> {
    // Not `getJson`: a sheet's read says it couldn't, it never leaves the page.
    try {
        const base = await orgBase();
        if (!base) return null;
        const res = await apiFetch(`${base}${path(id)}/deliveries`);
        if (!res.ok) return null;
        return ((await res.json()) as WebhookDeliveryList).data;
    } catch {
        return null;
    }
}

export function createWebhook(
    body: CreateWebhookEndpointBody,
): Promise<CrmResult<CreatedWebhookEndpoint>> {
    return mutate(
        "/webhooks",
        "POST",
        body,
        "We couldn't add that address. Try again.",
    );
}

export function updateWebhook(
    id: string,
    body: UpdateWebhookEndpointBody,
): Promise<CrmResult<WebhookEndpointView>> {
    return mutate(path(id), "PATCH", body, "We couldn't save that. Try again.");
}

export function removeWebhook(id: string): Promise<CrmResult<{ id: string }>> {
    return destroy(path(id), "We couldn't remove that address. Try again.");
}

export function rollWebhookSecret(
    id: string,
): Promise<CrmResult<CreatedWebhookEndpoint>> {
    return mutate(
        `${path(id)}/roll`,
        "POST",
        {},
        "We couldn't replace the secret. Try again.",
    );
}

export function testWebhook(
    id: string,
): Promise<CrmResult<WebhookDeliveryView>> {
    return mutate(
        `${path(id)}/test`,
        "POST",
        {},
        "We couldn't send a test. Try again.",
    );
}

export function resendDelivery(
    id: string,
    deliveryId: string,
): Promise<CrmResult<WebhookDeliveryView>> {
    return mutate(
        `${path(id)}/deliveries/${encodeURIComponent(deliveryId)}/resend`,
        "POST",
        {},
        "We couldn't resend that. Try again.",
    );
}
