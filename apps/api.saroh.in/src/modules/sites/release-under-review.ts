import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import {
    RELEASE_DISCARDED_MESSAGE,
    RELEASE_LIVE_MESSAGE,
} from "./test-release-go-live";
import { isReleaseSectionKey } from "./test-release-review";

/**
 * The test release a review request, a verdict or a note names (DEC-071,
 * T8). The caller has already proved the site is in the org and in the
 * caller's reviewer scope (`assertSiteInOrg`).
 */

export interface ReleaseUnderReview {
    id: string;
    number: number;
    name: string;
    /** What a verdict on it is bound to, instead of the draft's (KTD-10). */
    fingerprint: string;
}

const flags = new FeatureFlagService();

/**
 * The release, or 404 when it isn't this site's or the business doesn't
 * have test releases (KTD-16: it is not told the feature exists).
 *
 * `open`: the review is being added to, which a release nobody can put live
 * any more can't take: a discarded one, or one that is live now (409).
 * Reading its review stays open, as history.
 */
export async function releaseUnderReview(
    ctx: OrganizationContext,
    siteId: string,
    releaseId: string,
    opts: { open: boolean },
): Promise<ReleaseUnderReview> {
    const enabled = await flags.isEnabled(
        FlagKey.SITE_TEST_RELEASES,
        ctx.organizationId,
    );
    if (!enabled) throw new NotFoundException("Not found");

    const release = await prisma.siteTestRelease.findFirst({
        where: { id: releaseId, siteId, organizationId: ctx.organizationId },
        select: {
            id: true,
            number: true,
            name: true,
            fingerprint: true,
            discardedAt: true,
            wentLiveAt: true,
        },
    });
    if (!release) {
        throw new NotFoundException(`Test release "${releaseId}" not found`);
    }
    if (opts.open && release.wentLiveAt) {
        throw new ConflictException({
            message: RELEASE_LIVE_MESSAGE,
            details: { reason: "live" },
        });
    }
    if (opts.open && release.discardedAt) {
        throw new ConflictException({
            message: RELEASE_DISCARDED_MESSAGE,
            details: { reason: "discarded" },
        });
    }
    return {
        id: release.id,
        number: release.number,
        name: release.name,
        fingerprint: release.fingerprint,
    };
}

/** A frozen page: its path and how many sections it holds. */
export interface FrozenPage {
    path: string;
    sections: number;
}

/** The pages a release froze, by path (the snapshot keeps no page ids). */
export async function frozenPages(
    organizationId: string,
    releaseId: string,
): Promise<Map<string, FrozenPage>> {
    const row = await prisma.siteTestRelease.findFirst({
        where: { id: releaseId, organizationId },
        select: { publication: { select: { snapshot: true } } },
    });
    return pagesOf(row?.publication.snapshot);
}

/** The pages in a snapshot, by path. Anything malformed reads as absent. */
export function pagesOf(snapshot: unknown): Map<string, FrozenPage> {
    const pages = new Map<string, FrozenPage>();
    const list = (snapshot as { pages?: unknown } | null)?.pages;
    if (!Array.isArray(list)) return pages;
    for (const page of list as unknown[]) {
        if (page === null || typeof page !== "object") continue;
        const { path, sections } = page as {
            path?: unknown;
            sections?: unknown;
        };
        if (typeof path !== "string") continue;
        pages.set(path, {
            path,
            sections: Array.isArray(sections) ? sections.length : 0,
        });
    }
    return pages;
}

/** Whether a note's page and section are in the release as it was frozen. */
export function isOnFrozenPage(
    pages: Map<string, FrozenPage>,
    path: string | null | undefined,
    sectionKey: string,
): boolean {
    const page = path ? pages.get(path) : undefined;
    return page !== undefined && isReleaseSectionKey(sectionKey, page.sections);
}
