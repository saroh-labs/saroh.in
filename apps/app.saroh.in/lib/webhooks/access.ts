import "server-only";

import type { WebhookEndpointView } from "@saroh/api-contract";

import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import type { NoAsk } from "@/lib/settings/queries";

import type {
    WebhookDeliveriesScreen,
    WebhookDelivery,
    WebhooksScreen,
} from "./queries";
import { webhookDeliveriesRead, webhooksRead } from "./queries";
import { listDeliveries, listWebhooks } from "./service";

/** `webhook:manage` (Owners, and whoever they give it), while the API area is on. */
export async function mayReadWebhooks(): Promise<boolean> {
    if (!apiAreaOn()) return false;
    const org = await activeOrganizationOnce();
    return org?.actions?.includes("webhook:manage") ?? false;
}

/** An address as its row and sheet draw it, field by field: never its secret. */
export function endpointFacts(e: WebhookEndpointView): WebhookEndpointView {
    return {
        id: e.id,
        name: e.name,
        url: e.url,
        events: e.events,
        enabled: e.enabled,
        disabledAt: e.disabledAt,
        failureStreak: e.failureStreak,
        createdByUserId: e.createdByUserId,
        previousSecretUntil: e.previousSecretUntil,
        lastSent: e.lastSent
            ? { at: e.lastSent.at, status: e.lastSent.status }
            : null,
        createdAt: e.createdAt,
    };
}

export const webhooksServer: ServerRead<NoAsk, WebhooksScreen> = {
    read: webhooksRead,
    service: async () => {
        // The switch, plan and cap are the page's gate.
        return { endpoints: (await listWebhooks()).map(endpointFacts) };
    },
};

/** A message as the sheet's row draws it: never the receiver's answer. */
export function deliveryFacts(d: WebhookDelivery): WebhookDelivery {
    return {
        id: d.id,
        event: d.event,
        status: d.status,
        attempts: d.attempts,
        lastStatusCode: d.lastStatusCode,
        lastError: d.lastError,
        lastAttemptAt: d.lastAttemptAt,
        createdAt: d.createdAt,
    };
}

export const webhookDeliveriesServer: ServerRead<
    Parameters<typeof webhookDeliveriesRead.options>[1],
    WebhookDeliveriesScreen
> = {
    read: webhookDeliveriesRead,
    service: async ({ endpoint }) => {
        // Another business's address, or none: the API's 404, and the route's.
        const rows = await listDeliveries(endpoint);
        return rows ? { deliveries: rows.map(deliveryFacts) } : null;
    },
};
