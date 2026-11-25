import type { AiConnectionActivity } from "@saroh/api-contract";
import { z } from "zod";

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

/**
 * What one connection changed here, a page at a time, read when its sheet
 * opens (and for more): each change as the sheet draws it (what it did and
 * when), and the drafts it can roll back. The tool's name isn't drawn, so
 * it never crosses.
 */
export interface AiActivityScreen {
    data: Pick<AiConnectionActivity["data"][number], "id" | "summary" | "at">[];
    nextCursor: string | null;
    siteDrafts: AiConnectionActivity["siteDrafts"];
}

export const aiActivityRead = defineRead<AiActivityScreen>()({
    key: (orgId, p) => domainKey("settings", orgId, "ai-apps", "activity", p),
    route: {
        path: "/api/settings/developers/ai/activity",
        params: {
            connection: z.string().regex(/^[\w-]{1,64}$/),
            cursor: z.string().max(64).optional(),
        },
    },
    tier: "settings",
});
