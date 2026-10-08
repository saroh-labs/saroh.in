import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import { apiFetch, orgBase } from "@/lib/api/http";

import type {
    SearchTrackingRead,
    SearchTrackingSave,
    SearchTrackingView,
} from "./search-tracking";

/**
 * The site's "Search and tracking" section (DEC-108, U7): the read and the
 * save, `…/sites/:siteId/search-and-tracking`. Server-only.
 *
 * The read never throws and never comes back empty on a failure: it is
 * `{ ok: false }`, which the section draws as a failed state with Retry,
 * so a form that could save over the stored rows is never shown in its
 * place.
 */

function isView(v: unknown): v is SearchTrackingView {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return (
        typeof o.verifications === "object" &&
        o.verifications !== null &&
        Array.isArray(o.trackers) &&
        typeof o.switchedOff === "boolean"
    );
}

export async function readSearchTracking(
    siteId: string,
): Promise<SearchTrackingRead> {
    try {
        const base = await orgBase();
        if (!base) return { ok: false };
        const res = await apiFetch(
            `${base}/sites/${siteId}/search-and-tracking`,
        );
        if (!res.ok) return { ok: false };
        const body: unknown = await res.json();
        return isView(body) ? { ok: true, data: body } : { ok: false };
    } catch {
        return { ok: false };
    }
}

/**
 * Save what changed. Only extracted ids reach this: the paste stays in the
 * browser. A refusal keeps the field it is about (`details.field`, e.g.
 * `trackers.ga4`) and the plan's lock (`MODULE_LOCKED`, as `plan`).
 */
export async function saveSearchTracking(
    siteId: string,
    input: SearchTrackingSave,
): Promise<ApiResult<SearchTrackingView>> {
    const fallback = "Couldn't save that. Try again.";
    try {
        const base = await orgBase();
        if (!base) return { ok: false, error: "No active business." };
        const res = await apiFetch(
            `${base}/sites/${siteId}/search-and-tracking`,
            { method: "PATCH", body: JSON.stringify(input) },
        );
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) return toFailure(body, fallback);
        return isView(body)
            ? { ok: true, data: body }
            : { ok: false, error: fallback };
    } catch {
        return { ok: false, error: fallback };
    }
}
