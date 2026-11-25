import type {
    WebhookDeliveryView,
    WebhookEndpointView,
} from "@saroh/api-contract";
import { z } from "zod";

import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";

/**
 * Settings › API and AI apps › Notifications to your systems on React
 * Query (DEC-259). An address crosses as its row draws it, never its
 * signing secret: a new or replaced secret is shown once from the action's
 * own answer and never enters the cache.
 */
export interface WebhooksScreen {
    /** Every address, on or off: their count is the cap's. */
    endpoints: WebhookEndpointView[];
}

export const webhooksRead = defineRead<WebhooksScreen>()({
    key: (orgId) => domainKey("settings", orgId, "webhooks"),
    route: { path: "/api/settings/developers/webhooks", params: {} },
    tier: "settings",
});

/**
 * One address's latest messages, read when its sheet opens: each as its
 * row draws it. The receiver's answer (`responseSnippet`) is never drawn,
 * so it never crosses.
 */
export type WebhookDelivery = Pick<
    WebhookDeliveryView,
    | "id"
    | "event"
    | "status"
    | "attempts"
    | "lastStatusCode"
    | "lastError"
    | "lastAttemptAt"
    | "createdAt"
>;

export interface WebhookDeliveriesScreen {
    deliveries: WebhookDelivery[];
}

export const webhookDeliveriesRead = defineRead<WebhookDeliveriesScreen>()({
    key: (orgId, p) =>
        domainKey("settings", orgId, "webhooks", "deliveries", p),
    route: {
        path: "/api/settings/developers/webhooks/deliveries",
        params: { endpoint: z.string().regex(/^[\w-]{1,64}$/) },
    },
    tier: "settings",
});
