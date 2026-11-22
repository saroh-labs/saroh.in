"use server";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, orgBase } from "@/lib/api/http";

import type { PageDraft } from "./service";

/**
 * History's Undo (website editor plan U47a): one waiting change put back as
 * it is live, `POST …/sites/:siteId/changes/revert`. `unitKey` is a key
 * from `GET …/changes`; `revision` is the page draft's the editor holds,
 * for a section (a stale one is refused: someone saved since).
 *
 * For a section, `draft` is that page's draft after the undo, so the editor
 * carries on from its sections and revision; null for a page or site
 * setting. Then `router.refresh()`. A change that can't be put back on its
 * own (a new page, a moved link, the menu) is refused in words.
 */

export interface RevertResult {
    unitKey: string;
    draft: PageDraft | null;
}

export async function revertChange(
    siteId: string,
    input: { unitKey: string; revision?: number },
): Promise<ApiResult<RevertResult>> {
    const fallback = "Couldn't undo that. Try again.";
    try {
        const base = await orgBase();
        if (!base) return { ok: false, error: "No active business." };
        const res = await apiFetch(`${base}/sites/${siteId}/changes/revert`, {
            method: "POST",
            body: JSON.stringify(input),
        });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) return toFailure(body, fallback);
        return { ok: true, data: body as RevertResult };
    } catch {
        return { ok: false, error: fallback };
    }
}
