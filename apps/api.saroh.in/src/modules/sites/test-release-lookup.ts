import { GoneException, NotFoundException } from "@nestjs/common";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { publicSiteOnline } from "../organizations/organization-lifecycle.policy";
import type { PublicModulePageStates } from "./module-pages";
import { publicModulePageStates } from "./module-pages";
import type { SiteHostClass } from "./site-host-mode";
import { siteHostMode } from "./site-host-mode";
import type { PublicSiteIcon } from "./site-icon";
import { publicSiteIcon } from "./site-icon";
import { siteOriginOf } from "./site-origin";
import { hashPreviewToken } from "./site-preview-links.service";

/**
 * What a test host shows, for one link (DEC-071, T3).
 *
 * The renderer asks "this host, with this token: what do I draw?" and gets
 * the release's FROZEN snapshot, or a 404 / 410. Nothing here reads a draft,
 * and nothing here reads the live publication: a test host is only ever
 * served a TEST row, and a live host is never served one (R12).
 *
 * The order of the checks is the security property:
 *  1. The host must classify as test (KTD-7). A live host is a 404 before any
 *     token is looked at.
 *  2. The token must exist, and its release must be one of the site the host
 *     names. Anything else is the SAME 404, so a token tried on another
 *     business's test host learns nothing, not even that it exists.
 *  3. The business must have test releases on (KTD-16): the flag is the kill
 *     switch for the host too. Off is the same 404.
 *  4. Only then does a link that stopped working say why (410): `live`,
 *     `discarded`, `revoked` or `expired`, as preview links do.
 */

/**
 * The header the renderer sends a test link's token in (KTD-6). Never a path
 * segment, so no access log carries it; `common/logging/redact.ts` lists it.
 */
export const TEST_TOKEN_HEADER = "x-saroh-test-token";

/** Why a test link no longer opens its release. The page says it in words. */
export type TestReleaseGoneReason =
    "expired" | "revoked" | "discarded" | "live";

/** What the renderer draws on a test host. */
export interface TestReleaseView {
    /** The frozen snapshot, exactly as it was made. */
    snapshot: unknown;
    /** When the release was made, which is the snapshot's own time. */
    publishedAt: Date;
    siteId: string;
    /**
     * Whether each module page shows now (G15), read LIVE, as the live site
     * reads it: which modules are on is outside the release (R6).
     */
    modules?: PublicModulePageStates;
    /**
     * The icon the release shows (DEC-121): its frozen own, else the
     * business logo read live, else null for the plain tile.
     */
    icon?: PublicSiteIcon | null;
    release: { name: string; number: number; madeAt: Date };
    /** The live site's address, for "see the live site"; null if never published. */
    liveUrl: string | null;
}

const flags = new FeatureFlagService();

function missing(): never {
    throw new NotFoundException("No test release at this address");
}

const GONE_MESSAGE: Record<TestReleaseGoneReason, string> = {
    live: "This test release is live now.",
    discarded: "This test release was discarded.",
    revoked: "This test release link was taken back.",
    expired: "This test release link has stopped working.",
};

/**
 * Does the site behind the link answer to this host? The platform address
 * for `test--<address>`, or a VERIFIED custom domain bound to the site for
 * `test.<domain>`. Read across businesses: the host is the visitor's, not a
 * business's.
 */
async function hostNamesSite(
    shaped: SiteHostClass,
    site: { id: string; organizationId: string; subdomain: string | null },
): Promise<boolean> {
    const lookup = shaped.lookup;
    if (!lookup) return false;
    if (lookup.by === "subdomain") {
        return site.subdomain !== null && site.subdomain === lookup.subdomain;
    }
    const domain = await outsideOrgContext(() =>
        prisma.domain.findUnique({
            where: { hostname: lookup.hostname },
            select: { status: true, siteId: true, organizationId: true },
        }),
    );
    return (
        domain?.status === "VERIFIED" &&
        domain.siteId === site.id &&
        domain.organizationId === site.organizationId
    );
}

function goneReason(
    link: { expiresAt: Date; revokedAt: Date | null },
    release: { wentLiveAt: Date | null; discardedAt: Date | null },
    now: Date,
): TestReleaseGoneReason | null {
    // The most useful sentence first: a release that went live points at the
    // live site, whatever state its link is in (Q6).
    if (release.wentLiveAt) return "live";
    if (release.discardedAt) return "discarded";
    if (link.revokedAt) return "revoked";
    if (link.expiresAt.getTime() <= now.getTime()) return "expired";
    return null;
}

/**
 * PUBLIC: the release a test-host link opens. 404 for a live host, an
 * unknown token, a token for another site, or a business with test releases
 * off; 410 with `details.reason` (and `details.liveUrl` for `live`) for a
 * link that has stopped working.
 */
export async function resolveTestRelease(
    rawHost: string,
    token: string | undefined,
    now: Date = new Date(),
): Promise<TestReleaseView> {
    const shaped = await siteHostMode(rawHost);
    if (shaped.mode !== "test" || !shaped.lookup) missing();
    if (!token) missing();

    // By hash (#284, KTD-6): the database never holds the token. Read across
    // businesses, because until the link is found no business is known.
    const link = await outsideOrgContext(() =>
        prisma.siteTestReleaseLink.findUnique({
            where: { tokenHash: hashPreviewToken(token) },
            select: {
                id: true,
                siteId: true,
                organizationId: true,
                expiresAt: true,
                revokedAt: true,
                testRelease: {
                    select: {
                        siteId: true,
                        number: true,
                        name: true,
                        createdAt: true,
                        discardedAt: true,
                        wentLiveAt: true,
                        publication: {
                            select: {
                                kind: true,
                                siteId: true,
                                snapshot: true,
                                publishedAt: true,
                            },
                        },
                    },
                },
                site: {
                    select: {
                        id: true,
                        organizationId: true,
                        subdomain: true,
                        deletedAt: true,
                        organization: { select: { lifecycleStatus: true } },
                    },
                },
            },
        }),
    );
    if (!link) missing();
    const { testRelease: release, site } = link;
    if (
        site.deletedAt ||
        // Offline with its business (#921).
        !publicSiteOnline(site.organization.lifecycleStatus) ||
        release.siteId !== site.id ||
        release.publication.siteId !== site.id ||
        // Never anything but the frozen TEST row (R12).
        release.publication.kind !== "TEST" ||
        !(await hostNamesSite(shaped, site))
    ) {
        missing();
    }

    const organizationId = site.organizationId;
    return runInOrgContext(organizationId, async () => {
        if (
            !(await flags.isEnabled(FlagKey.SITE_TEST_RELEASES, organizationId))
        ) {
            missing();
        }

        const reason = goneReason(link, release, now);
        if (reason) {
            const liveUrl =
                reason === "live"
                    ? await siteOriginOf(organizationId, { siteId: site.id })
                    : null;
            // The reason rides in `details`, the one slot the api's error
            // envelope passes through; the renderer branches on it.
            throw new GoneException({
                message: GONE_MESSAGE[reason],
                details: { reason, ...(liveUrl ? { liveUrl } : {}) },
            });
        }

        const { snapshot, publishedAt } = release.publication;
        const [modules, liveUrl, icon] = await Promise.all([
            publicModulePageStates(snapshot, organizationId),
            siteOriginOf(organizationId, { siteId: site.id }),
            publicSiteIcon(snapshot, organizationId),
        ]);

        // Recorded, not awaited: a reviewer's page must not wait on, or fail
        // for, a bookkeeping write.
        void prisma.siteTestReleaseLink
            .update({
                where: { id: link.id },
                data: { lastUsedAt: now },
                select: { id: true },
            })
            .catch(() => undefined);

        return {
            snapshot,
            publishedAt,
            siteId: site.id,
            ...(modules ? { modules } : {}),
            icon,
            release: {
                name: release.name,
                number: release.number,
                madeAt: release.createdAt,
            },
            liveUrl,
        };
    });
}
