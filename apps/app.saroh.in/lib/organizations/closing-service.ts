import { cache } from "react";

import { apiFetch, orgBase } from "@/lib/api/http";

import type { ClosingView } from "./closing";

/**
 * What a business scheduled for deletion should finish first (#921):
 * `GET /organizations/:org/closing`, for the banner on every page.
 * Server-only. Null when it can't be read — the banner is an aid, and the
 * sweep keeps a business that owes refunds whether or not it was shown.
 * Request-cached: the shell reads it once a render.
 */
export const closingOrNull = cache(async (): Promise<ClosingView | null> => {
    try {
        const base = await orgBase();
        if (!base) return null;
        const res = await apiFetch(`${base}/closing`);
        if (!res.ok) return null;
        return (await res.json()) as ClosingView;
    } catch {
        // Degraded, not failed: the page under it still renders.
        return null;
    }
});
