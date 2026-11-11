import type { CrmResult } from "@/lib/api/http";
import { destroy, getList, orgBase } from "@/lib/api/http";

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
