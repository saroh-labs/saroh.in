import type {
    AiConnectionActivity,
    AiConnectionRollback,
} from "@saroh/api-contract";

import type { CrmResult } from "@/lib/api/http";
import { destroy, getJson, getList, mutate, orgBase } from "@/lib/api/http";

import type { AiConnection } from "./types";

/**
 * Settings › API and AI apps › AI assistants:
 * `organizations/:org/ai-connections`. Server-only; the list is the tab's
 * required read (a failure throws to `error.tsx`).
 */
export async function listAiConnections(): Promise<AiConnection[]> {
    const base = await orgBase();
    if (!base) return [];
    return getList<AiConnection>(`${base}/ai-connections`);
}

/** Takes this business off the connection; the others it covers keep it. */
export function disconnectAiConnection(id: string): Promise<CrmResult<object>> {
    return destroy(
        `/ai-connections/${encodeURIComponent(id)}`,
        "We couldn't disconnect it. Try again.",
    );
}

const path = (id: string) => `/ai-connections/${encodeURIComponent(id)}`;

/**
 * What one connection changed here, a page at a time, and the website
 * drafts it can roll back; null when it isn't this business's (the API's
 * 404). Read by its sheet's own read route: any other failure throws there
 * (a 503), said in the sheet, never leaving the page.
 */
export async function readAiActivity(
    id: string,
    cursor?: string,
): Promise<AiConnectionActivity | null> {
    const base = await orgBase();
    if (!base) return null;
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return getJson<AiConnectionActivity>(`${base}${path(id)}/activity${query}`);
}

/** Puts a website's draft back to before the connection's latest session. */
export function rollBackAiSiteDraft(
    id: string,
    siteId: string,
): Promise<CrmResult<AiConnectionRollback>> {
    return mutate(
        `${path(id)}/roll-back`,
        "POST",
        { siteId },
        "We couldn't roll back the draft. Try again.",
    );
}
