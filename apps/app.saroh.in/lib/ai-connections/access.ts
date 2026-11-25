import "server-only";

import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import type { NoAsk } from "@/lib/settings/queries";

import type { AiActivityScreen, AiAppsScreen } from "./queries";
import { aiActivityRead, aiConnectionsRead } from "./queries";
import { listAiConnections, readAiActivity } from "./service";
import type { AiConnection } from "./types";

/** AI assistants: everyone in the business sees their own (the Owner everyone's). */
export async function mayReadAiApps(): Promise<boolean> {
    return apiAreaOn() && !!(await activeOrganizationOnce());
}

/** A connection as its row draws it, field by field: never a token or client secret. */
export function connectionFacts(c: AiConnection): AiConnection {
    return {
        id: c.id,
        app: { name: c.app.name, known: c.app.known },
        person: { id: c.person.id, name: c.person.name },
        scopes: c.scopes,
        otherBusinesses: c.otherBusinesses,
        connectedAt: c.connectedAt,
        lastUsedAt: c.lastUsedAt,
    };
}

export const aiAppsServer: ServerRead<NoAsk, AiAppsScreen> = {
    read: aiConnectionsRead,
    service: async () => ({
        connections: (await listAiConnections()).map(connectionFacts),
    }),
};

export const aiActivityServer: ServerRead<
    Parameters<typeof aiActivityRead.options>[1],
    AiActivityScreen
> = {
    read: aiActivityRead,
    // The API lets the person who connected it, or `apikey:manage`, read it.
    service: async ({ connection, cursor }) => {
        const page = await readAiActivity(connection, cursor);
        if (!page) return null;
        return {
            data: page.data.map((c) => ({
                id: c.id,
                summary: c.summary,
                at: c.at,
            })),
            nextCursor: page.nextCursor,
            siteDrafts: page.siteDrafts.map((d) => ({
                siteId: d.siteId,
                siteName: d.siteName,
                since: d.since,
            })),
        };
    },
};
