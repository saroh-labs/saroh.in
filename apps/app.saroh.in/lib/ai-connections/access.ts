import "server-only";

import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import type { NoAsk } from "@/lib/settings/queries";

import type { AiAppsScreen } from "./queries";
import { aiConnectionsRead } from "./queries";
import { listAiConnections } from "./service";
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
