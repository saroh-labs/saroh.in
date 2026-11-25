"use server";

import { writeAsOrgIfSent } from "@/lib/api/assert-active-org";
import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, orgBase } from "@/lib/api/http";

import type { PageDraft } from "./service";

/**
 * Restore a version as the draft (owner, 20 Nov 2026):
 * `POST …/sites/:siteId/publications/:publicationId/restore-draft`. The
 * version's sections are copied into the draft, each change the restorer's;
 * nothing goes live until Publish. `pageId` and `revision` are the open
 * page's and the draft revision the editor holds (stale: someone saved
 * since, refused). Then reload the editor, or `router.refresh()`.
 */

export interface RestoreAsDraftResult {
    publicationId: string;
    /** Pages whose draft changed. */
    restored: number;
    draft: PageDraft | null;
}

export async function restoreVersionAsDraft(
    siteId: string,
    publicationId: string,
    input: { pageId?: string; revision?: number } = {},
    /** The tab's business, from a React Query screen (DEC-259). */
    orgId?: string,
): Promise<ApiResult<RestoreAsDraftResult>> {
    if (orgId) {
        return writeAsOrgIfSent(orgId, () =>
            restoreVersionAsDraft(siteId, publicationId, input),
        );
    }
    const fallback = "Couldn't restore that version. Try again.";
    try {
        const base = await orgBase();
        if (!base) return { ok: false, error: "No active business." };
        const res = await apiFetch(
            `${base}/sites/${siteId}/publications/${encodeURIComponent(publicationId)}/restore-draft`,
            { method: "POST", body: JSON.stringify(input) },
        );
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) return toFailure(body, fallback);
        return { ok: true, data: body as RestoreAsDraftResult };
    } catch {
        return { ok: false, error: fallback };
    }
}
