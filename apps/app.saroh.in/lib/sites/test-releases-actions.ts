"use server";

import type { SiteChangeKind } from "./pending";
import { getSite } from "./service";
import type { TestReleaseLinkDays } from "./test-releases";
import {
    cancelScheduledGoLive as cancelScheduledGoLiveApi,
    createTestRelease as createTestReleaseApi,
    createTestReleaseLink as createTestReleaseLinkApi,
    discardTestRelease as discardTestReleaseApi,
    goLiveWithRelease as goLiveWithReleaseApi,
    openTestRelease as openTestReleaseApi,
    readTestReleases,
    revokeTestReleaseLink as revokeTestReleaseLinkApi,
    scheduleGoLive as scheduleGoLiveApi,
    updateTestRelease as updateTestReleaseApi,
} from "./test-releases-api";

/**
 * Server Actions for test releases (DEC-071, T11): thin wrappers the editor's
 * client components call, beside `actions.ts` rather than inside it. The API
 * decides who may do each thing.
 */

export async function listTestReleases(siteId: string) {
    return readTestReleases(siteId);
}

/**
 * The live side of the site after a go-live or a publish: what publishing
 * would change now, and when it last went live. Null when it can't be read;
 * the editor then leaves its counts for the next save to settle.
 */
export async function readSiteLiveState(siteId: string): Promise<{
    pendingSectionChanges: number | null;
    pendingSiteChanges: SiteChangeKind[] | null;
    livePublishedAt: string | null;
} | null> {
    try {
        const site = await getSite(siteId);
        if (!site) return null;
        return {
            pendingSectionChanges: site.pendingSectionChanges,
            pendingSiteChanges: site.pendingSiteChanges,
            livePublishedAt: site.currentPublication?.publishedAt ?? null,
        };
    } catch {
        // Not a page read: a refused or failed read here says only that the
        // counts wait for the next save, which the caller shows as unknown.
        return null;
    }
}

export async function createTestRelease(
    siteId: string,
    input: { name?: string; note?: string | null },
) {
    return createTestReleaseApi(siteId, input);
}

export async function updateTestRelease(
    siteId: string,
    releaseId: string,
    input: { name?: string; note?: string | null },
) {
    return updateTestReleaseApi(siteId, releaseId, input);
}

export async function discardTestRelease(siteId: string, releaseId: string) {
    return discardTestReleaseApi(siteId, releaseId);
}

export async function goLiveWithRelease(
    siteId: string,
    releaseId: string,
    override: boolean,
) {
    return goLiveWithReleaseApi(siteId, releaseId, override);
}

export async function scheduleGoLive(
    siteId: string,
    releaseId: string,
    input: { date: string; time: string; override?: boolean },
) {
    return scheduleGoLiveApi(siteId, releaseId, input);
}

export async function cancelScheduledGoLive(siteId: string, releaseId: string) {
    return cancelScheduledGoLiveApi(siteId, releaseId);
}

export async function createTestReleaseLink(
    siteId: string,
    releaseId: string,
    days: TestReleaseLinkDays,
) {
    return createTestReleaseLinkApi(siteId, releaseId, days);
}

export async function openTestRelease(siteId: string, releaseId: string) {
    return openTestReleaseApi(siteId, releaseId);
}

export async function revokeTestReleaseLink(siteId: string, linkId: string) {
    return revokeTestReleaseLinkApi(siteId, linkId);
}
