import "server-only";

import type { WebhookEndpointView } from "@saroh/api-contract";

import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import type { NoAsk } from "@/lib/settings/queries";

import type { WebhooksScreen } from "./queries";
import { webhooksRead } from "./queries";
import { listWebhooks } from "./service";

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
