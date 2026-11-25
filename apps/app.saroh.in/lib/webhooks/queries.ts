import type { WebhookEndpointView } from "@saroh/api-contract";

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
