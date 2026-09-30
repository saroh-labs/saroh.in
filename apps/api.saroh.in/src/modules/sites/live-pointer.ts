import type { Prisma } from "@saroh/database";

import type { ApprovalRow, ReviewRoute } from "./review-route";
import { reviewStanding } from "./review-route";

/**
 * The one way a site's live version changes (DEC-071, KTD-3).
 *
 * Publish, restore and Go live each put a snapshot live, and each must do the
 * same four things in the same transaction: ask where the site stands with its
 * reviewers, append a LIVE Publication that says which route it took, point
 * `Site.currentPublicationId` at it, and write the BYPASSED record when a
 * review was outstanding.
 *
 * #279 happened because restore was a second repointing path that forgot the
 * last of those. DEV_LEARNINGS said "any new path must do the same", which is
 * a rule that has to be remembered. This file makes it structural instead:
 * `live-pointer.source.spec.ts` fails if `currentPublicationId` is written
 * anywhere else in `modules/sites`.
 *
 * Callers own everything before the write: who may, which snapshot, whether
 * it can be drawn. `putLive` owns the write.
 */

/** Which act put the version live. Says why, in logs and in tests. */
export type LiveSource = "publish" | "restore" | "go-live";

/** What `putLive` needs of a transaction client, and nothing more. */
export type LiveTx = Pick<
    Prisma.TransactionClient,
    "publication" | "site" | "siteApproval"
>;

export interface PutLiveInput {
    site: { id: string; organizationId: string };
    /** The snapshot to serve, exactly as it will be stored. */
    snapshot: unknown;
    source: LiveSource;
    /** Who is putting it live: the publisher on the record. */
    actor: { userId: string };
    /**
     * `draftFingerprint` of what goes live, which an approval must have
     * covered to settle a review: the draft being published, the version
     * being restored, or the test release going live (its stored
     * fingerprint, KTD-10).
     */
    fingerprint: string;
    /** The template stamp the Publication row requires. */
    template: { id: string; version: number };
    /**
     * The row's `publishedAt`. Left to the column's default (now) when not
     * given, which is what restore has always done.
     */
    publishedAt?: Date;
    /** Page scoping, copied from a restored version. Null for a whole site. */
    pageId?: string | null;
    path?: string | null;
    /** The TEST publication a go-live copied (KTD-2). */
    sourcePublicationId?: string | null;
}

export interface PutLiveResult {
    publicationId: string;
    publishedAt: Date;
    /** True when it went live past an outstanding review (#199, #279). */
    bypassed: boolean;
    route: ReviewRoute;
}

/**
 * Put `snapshot` live for `site`, inside the caller's transaction.
 *
 * The review standing is asked of `tx`, beside the write (#278): a verdict
 * posted while this is in flight is either seen or lands after it.
 */
export async function putLive(
    tx: LiveTx,
    input: PutLiveInput,
): Promise<PutLiveResult> {
    const { site, actor } = input;
    const standing = await readReviewStanding(tx, {
        siteId: site.id,
        organizationId: site.organizationId,
        fingerprint: input.fingerprint,
        publisherUserId: actor.userId,
    });
    const bypassed = standing.outstanding;

    const publication = await tx.publication.create({
        data: {
            siteId: site.id,
            organizationId: site.organizationId,
            // A site only ever points at a LIVE row (KTD-2). Said here rather
            // than left to the column default, so no caller can append a TEST
            // row and point at it.
            kind: "LIVE",
            ...(input.pageId !== undefined ? { pageId: input.pageId } : {}),
            ...(input.path !== undefined ? { path: input.path } : {}),
            // Which route this took, so version history can tell "a reviewer
            // approved it" from "nobody was asked" (#193, #278).
            reviewRoute: standing.route satisfies ReviewRoute,
            // Through `unknown`: SiteStyle is a precise interface, and
            // Prisma's InputJsonValue index signature does not accept one
            // directly even though the value is plain JSON.
            snapshot: input.snapshot as Prisma.InputJsonValue,
            templateId: input.template.id,
            templateVersion: input.template.version,
            publishedByUserId: actor.userId,
            ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
            ...(input.sourcePublicationId
                ? { sourcePublicationId: input.sourcePublicationId }
                : {}),
        },
        select: { id: true, publishedAt: true },
    });

    // The only write of the live pointer in modules/sites.
    await tx.site.update({
        where: { id: site.id },
        data: { currentPublicationId: publication.id },
    });

    if (bypassed) {
        // Appended like every other approval event, and linked to the new
        // version, so "changes requested, then put live anyway" reads as
        // history in version history (#199, #279).
        await tx.siteApproval.create({
            data: {
                siteId: site.id,
                organizationId: site.organizationId,
                byUserId: actor.userId,
                outcome: "BYPASSED",
                publicationId: publication.id,
            },
            select: { id: true },
        });
    }

    return {
        publicationId: publication.id,
        publishedAt: publication.publishedAt,
        bypassed,
        route: standing.route,
    };
}

/**
 * Where the site stands with its reviewers for `fingerprint`, asked of
 * `client` so a transaction gets its own answer (#278). Verdicts only:
 * BYPASSED and OVERRIDDEN are going live's own records, and must not settle
 * the request they were written about.
 */
export async function readReviewStanding(
    client: Pick<Prisma.TransactionClient, "siteApproval">,
    input: {
        siteId: string;
        organizationId: string;
        fingerprint: string;
        publisherUserId: string | null;
    },
) {
    const verdicts = (await client.siteApproval.findMany({
        where: {
            siteId: input.siteId,
            organizationId: input.organizationId,
            outcome: { in: ["REQUESTED", "APPROVED", "CHANGES_REQUESTED"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
            outcome: true,
            byUserId: true,
            draftFingerprint: true,
            createdAt: true,
        },
    })) as ApprovalRow[];

    return reviewStanding(verdicts, input.fingerprint, input.publisherUserId);
}
