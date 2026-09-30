import { toFailure } from "@/lib/api/failure";
import { apiFetch, getActiveOrgId, getJson } from "@/lib/api/http";

import type { SitesResult } from "./service";
import type { TestReleaseDetail } from "./test-release-types";
import type {
    CreatedTestReleaseLink,
    GoLiveResult,
    TestRelease,
    TestReleaseLink,
    TestReleaseLinkDays,
    TestReleaseList,
    TestReleasesRead,
} from "./test-releases";

/**
 * A site's test releases, through the API (DEC-071, T11). Server-only, like
 * `service.ts`, which it sits beside rather than grows: the editor's reads
 * and writes of `/sites/:siteId/test-releases`. Client components reach these
 * through `test-releases-actions.ts`.
 */

async function base(siteId: string): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId
        ? `/organizations/${orgId}/sites/${encodeURIComponent(siteId)}/test-releases`
        : null;
}

/**
 * Every release of the site. `off` for a 404 (the flag is off, KTD-16) or a
 * 403, so the editor shows nothing it can't use; `failed` for anything else,
 * which the panel says rather than showing an empty list. Never throws and
 * never calls `forbidden()`: the releases are beside the editor, not what it
 * is for, and an outage here must not keep a merchant from editing.
 */
export async function readTestReleases(
    siteId: string,
): Promise<TestReleasesRead> {
    const path = await base(siteId);
    if (!path) return { state: "off" };
    try {
        const res = await apiFetch(path);
        if (res.status === 404 || res.status === 403) return { state: "off" };
        if (!res.ok) return { state: "failed" };
        const list = (await res.json()) as TestReleaseList;
        return { state: "on", list };
    } catch {
        return { state: "failed" };
    }
}

/**
 * One release with its frozen snapshot, for the in-app release view (T12).
 * A page read: null for a 404 (not this site's, or test releases are off),
 * `forbidden()` for a 403, and a failure throws to the segment boundary.
 */
export async function readTestRelease(
    siteId: string,
    releaseId: string,
): Promise<TestReleaseDetail | null> {
    const path = await base(siteId);
    if (!path) return null;
    return getJson<TestReleaseDetail>(
        `${path}/${encodeURIComponent(releaseId)}`,
    );
}

async function send<T>(
    siteId: string,
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<SitesResult<T>> {
    const root = await base(siteId);
    if (!root) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${root}${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = (await res.json().catch(() => null)) as unknown;
    if (res.ok) return { ok: true, data: data as T };
    const failure = toFailure(data, fallback);
    return {
        ok: false,
        error: failure.error,
        ...(failure.field ? { field: failure.field } : {}),
        ...codeOf(data),
    };
}

/** The API's `details.code` (APPROVAL_REQUIRED), when it sends one. */
function codeOf(data: unknown): { code?: string } {
    const body = (data ?? {}) as { error?: { details?: { code?: unknown } } };
    const code = body.error?.details?.code;
    return typeof code === "string" ? { code } : {};
}

export function createTestRelease(
    siteId: string,
    input: { name?: string; note?: string | null },
) {
    return send<{ release: TestRelease; link: CreatedTestReleaseLink }>(
        siteId,
        "",
        "POST",
        input,
        "Couldn't make a test release.",
    );
}

export function updateTestRelease(
    siteId: string,
    releaseId: string,
    input: { name?: string; note?: string | null },
) {
    return send<TestRelease>(
        siteId,
        `/${encodeURIComponent(releaseId)}`,
        "PATCH",
        input,
        "Couldn't save the test release.",
    );
}

export function discardTestRelease(siteId: string, releaseId: string) {
    return send<TestRelease>(
        siteId,
        `/${encodeURIComponent(releaseId)}/discard`,
        "POST",
        undefined,
        "Couldn't discard the test release.",
    );
}

export function goLiveWithRelease(
    siteId: string,
    releaseId: string,
    override: boolean,
) {
    return send<GoLiveResult>(
        siteId,
        `/${encodeURIComponent(releaseId)}/go-live`,
        "POST",
        override ? { override: true } : {},
        "Couldn't go live with the test release.",
    );
}

export function scheduleGoLive(
    siteId: string,
    releaseId: string,
    input: { date: string; time: string; override?: boolean },
) {
    return send<TestRelease>(
        siteId,
        `/${encodeURIComponent(releaseId)}/schedule`,
        "POST",
        input,
        "Couldn't schedule the go-live.",
    );
}

export function cancelScheduledGoLive(siteId: string, releaseId: string) {
    return send<TestRelease>(
        siteId,
        `/${encodeURIComponent(releaseId)}/schedule`,
        "DELETE",
        undefined,
        "Couldn't cancel the scheduled go-live.",
    );
}

export function createTestReleaseLink(
    siteId: string,
    releaseId: string,
    days: TestReleaseLinkDays,
) {
    return send<CreatedTestReleaseLink>(
        siteId,
        `/${encodeURIComponent(releaseId)}/links`,
        "POST",
        { days },
        "Couldn't make a new link.",
    );
}

export function openTestRelease(siteId: string, releaseId: string) {
    return send<CreatedTestReleaseLink>(
        siteId,
        `/${encodeURIComponent(releaseId)}/open`,
        "POST",
        undefined,
        "Couldn't open the test release.",
    );
}

export function revokeTestReleaseLink(siteId: string, linkId: string) {
    return send<TestReleaseLink>(
        siteId,
        `/links/${encodeURIComponent(linkId)}/revoke`,
        "POST",
        undefined,
        "Couldn't turn the link off.",
    );
}
