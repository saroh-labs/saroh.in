import type { ApiKeyListItem, ApiUsageView } from "@saroh/api-contract";

import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";

/**
 * Settings › API and AI apps › Connections and Usage on React Query
 * (DEC-259). A key crosses as its row draws it: its visible start
 * (`prefix`) and facts, never the token. A new or replaced key's token is
 * shown once from the action's own answer and never enters the cache.
 */
export interface KeysScreen {
    /** The keys that work now (a roll's grace included): their count is the cap's. */
    keys: ApiKeyListItem[];
}

export interface UsageScreen {
    usage: ApiUsageView;
    plan: string | null;
    upgrade: { plan: string; href: string } | null;
}

export const apiKeysRead = defineRead<KeysScreen>()({
    key: (orgId) => domainKey("settings", orgId, "api-keys"),
    route: { path: "/api/settings/developers/keys", params: {} },
    tier: "settings",
});

/** This minute's calls move on their own: `live`, and Refresh reads it again. */
export const apiUsageRead = defineRead<UsageScreen>()({
    key: (orgId) => domainKey("settings", orgId, "api-usage"),
    route: { path: "/api/settings/developers/usage", params: {} },
    tier: "live",
});
