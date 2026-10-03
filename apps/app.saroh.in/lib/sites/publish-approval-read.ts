import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, orgBase } from "@/lib/api/http";

import type {
    PublishApproval,
    PublishApprovalFields,
} from "./publish-approval";
import { publishApprovalOf } from "./publish-approval";

/**
 * "Publishing needs approval" (DEC-071, T13): the read and the write.
 * Server-only.
 */

/**
 * Whether test releases are on for the business (`SITE_TEST_RELEASES`).
 *
 * The API answers the flag on the releases list itself: 404 while it's off
 * (KTD-16), so a business without it is never told the feature exists. Any
 * other failure is read as off too — the row is left out, which is the safe
 * way round, and a setting already on is still shown (`publishApprovalOf`).
 */
async function testReleasesOn(siteId: string): Promise<boolean> {
    try {
        const base = await orgBase();
        if (!base) return false;
        const res = await apiFetch(`${base}/sites/${siteId}/test-releases`);
        return res.ok;
    } catch {
        return false;
    }
}

/** The setting to show on the site's settings, or null to show nothing. */
export async function readPublishApproval(
    site: PublishApprovalFields & { id: string },
): Promise<PublishApproval | null> {
    // A setting already on is shown whatever the flag says, so the release
    // list is asked only when it would change the answer.
    if (site.publishNeedsApproval === true) {
        return publishApprovalOf(site, true);
    }
    return publishApprovalOf(site, await testReleasesOn(site.id));
}

/**
 * Turn it on or off. Owner only (403), on only with test releases (409),
 * and it takes effect at once: it isn't draft state.
 */
export async function savePublishNeedsApproval(
    siteId: string,
    on: boolean,
): Promise<ApiResult<{ on: boolean }>> {
    const fallback = on
        ? "Couldn't turn on publishing approval. Try again."
        : "Couldn't turn off publishing approval. Try again.";
    try {
        const base = await orgBase();
        if (!base) return { ok: false, error: "No active business." };
        const res = await apiFetch(`${base}/sites/${siteId}/settings`, {
            method: "PATCH",
            body: JSON.stringify({ publishNeedsApproval: on }),
        });
        const body = (await res.json().catch(() => null)) as {
            publishNeedsApproval?: unknown;
        } | null;
        if (!res.ok) return toFailure(body, fallback);
        return {
            ok: true,
            data: { on: body?.publishNeedsApproval === true },
        };
    } catch {
        return { ok: false, error: fallback };
    }
}
