import { toFailure } from "@/lib/api/failure";
import { apiFetch, getActiveOrgId, getJson } from "@/lib/api/http";

import type {
    PublishRequestAnswer,
    PublishRequestView,
} from "./publish-requests";
import type { SitesResult } from "./service";

/**
 * An AI app's publish request, through the API (DEC-215 as amended 12 Nov
 * 2026). Server-only; client components reach the writes through
 * `publish-requests-actions.ts`. The API decides who may answer it
 * (`site:publish`).
 */

async function base(siteId: string, requestId: string): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId
        ? `/organizations/${orgId}/sites/${encodeURIComponent(siteId)}/publish-requests/${encodeURIComponent(requestId)}`
        : null;
}

/**
 * A page read: null for a 404 (unknown, or another business's or site's),
 * `forbidden()` for a 403, and a failure throws to the segment boundary.
 */
export async function readPublishRequest(
    siteId: string,
    requestId: string,
): Promise<PublishRequestView | null> {
    const path = await base(siteId, requestId);
    return path ? getJson<PublishRequestView>(path) : null;
}

async function answer(
    siteId: string,
    requestId: string,
    how: "confirm" | "decline",
    fallback: string,
): Promise<SitesResult<PublishRequestAnswer>> {
    const path = await base(siteId, requestId);
    if (!path)
        return {
            ok: false,
            error: "No business is open. Choose one and try again.",
        };
    const res = await apiFetch(`${path}/${how}`, { method: "POST" });
    const data = (await res.json().catch(() => null)) as unknown;
    if (res.ok) return { ok: true, data: data as PublishRequestAnswer };
    const body = (data ?? {}) as { error?: { details?: { code?: unknown } } };
    const code = body.error?.details?.code;
    return {
        ok: false,
        error: toFailure(data, fallback).error,
        ...(typeof code === "string" ? { code } : {}),
    };
}

export const confirmPublishRequest = (siteId: string, requestId: string) =>
    answer(siteId, requestId, "confirm", "Couldn't publish the website.");

export const declinePublishRequest = (siteId: string, requestId: string) =>
    answer(siteId, requestId, "decline", "Couldn't answer the request.");
