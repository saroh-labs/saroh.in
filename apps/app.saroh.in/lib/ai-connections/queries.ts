import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";

import type { AiConnection } from "./types";

/**
 * Settings › API and AI apps › AI assistants on React Query (DEC-259): the
 * AI apps signed in to this business, each as its row draws it, never an
 * OAuth token or client secret.
 */
export interface AiAppsScreen {
    connections: AiConnection[];
}

export const aiConnectionsRead = defineRead<AiAppsScreen>()({
    key: (orgId) => domainKey("settings", orgId, "ai-apps"),
    route: { path: "/api/settings/developers/ai", params: {} },
    tier: "settings",
});
