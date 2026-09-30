import { ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import type { LiveTx, PutLiveResult } from "./live-pointer";
import { putLive } from "./live-pointer";
import { checkRenderability } from "./publication-renderability";
import { ADDRESS_MISSING_MESSAGE } from "./site-flags";

/**
 * Go live with a test release (DEC-071, T7): put exactly its frozen snapshot
 * live, whatever the draft looks like now (R8).
 *
 * It is a pointer flip, like restore (KTD-2): a LIVE copy of the TEST
 * publication is appended, with only `publishedAt` restamped, and the site
 * is pointed at the copy through `putLive`, which records the review
 * standing and any bypass (#279). The live enquiry form's fields switch with
 * the pointer, because they are read from the live snapshot (#281, KTD-4).
 *
 * Runs inside the caller's transaction, under a lock on the release row, so
 * a second go-live, a discard or a scheduled run racing this one sees the
 * release already live and stops. The scheduled go-live (T10) reuses it.
 */

export type GoLiveTx = LiveTx &
    Pick<Prisma.TransactionClient, "siteTestRelease" | "job" | "$queryRaw">;

export interface GoLiveInput {
    siteId: string;
    organizationId: string;
    releaseId: string;
    /** Who is going live: the publisher on the record. */
    actorUserId: string;
    /** When it goes live. Defaults to now. */
    at?: Date;
}

/** The version going live replaced, so the answer can say so. */
export interface ReplacedVersion {
    publicationId: string;
    publishedAt: Date;
    publishedByUserId: string | null;
}

export interface GoLiveOutcome extends PutLiveResult {
    replaced: ReplacedVersion | null;
}

export const RELEASE_DISCARDED_MESSAGE = "This test release was discarded.";
export const RELEASE_LIVE_MESSAGE = "This test release is live now.";
export const RELEASE_SCHEDULED_MESSAGE =
    "This test release is scheduled to go live. Cancel the scheduled go-live first.";
export const RELEASE_GOING_LIVE_MESSAGE =
    "This test release is going live now.";

export async function goLiveWithRelease(
    tx: GoLiveTx,
    input: GoLiveInput,
): Promise<GoLiveOutcome> {
    const { siteId, organizationId, releaseId } = input;

    // The release row is the lock (KTD-13): whoever holds it decides.
    const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "SiteTestRelease"
        WHERE id = ${releaseId}
          AND "siteId" = ${siteId}
          AND "organizationId" = ${organizationId}
        FOR UPDATE`;
    if (locked.length === 0) {
        throw new NotFoundException(`Test release "${releaseId}" not found`);
    }

    const release = await tx.siteTestRelease.findUniqueOrThrow({
        where: { id: releaseId },
        select: {
            publicationId: true,
            fingerprint: true,
            discardedAt: true,
            wentLiveAt: true,
            goLiveAt: true,
            goLiveJobId: true,
            publication: {
                select: {
                    snapshot: true,
                    templateId: true,
                    templateVersion: true,
                },
            },
        },
    });
    if (release.wentLiveAt) {
        throw new ConflictException({
            message: RELEASE_LIVE_MESSAGE,
            details: { reason: "live" },
        });
    }
    if (release.discardedAt) {
        throw new ConflictException({
            message: RELEASE_DISCARDED_MESSAGE,
            details: { reason: "discarded" },
        });
    }
    if (release.goLiveAt) {
        await refuseScheduled(tx, release.goLiveJobId);
    }

    /*
     * A deploy since the freeze could have retired a block the release
     * holds. Asked of the TEST snapshot, which is what goes live: a
     * section this build can't draw is refused by name rather than served
     * as a gap.
     */
    const snapshot = release.publication.snapshot;
    const { renderable, unrenderable } = checkRenderability(snapshot);
    if (!renderable) {
        const first = unrenderable.length > 0 ? unrenderable[0] : null;
        throw new ConflictException({
            message: first
                ? `Can't go live: page "${first.path}" has a "${first.type}" section this version of Saroh can't show. Make a new test release from your draft.`
                : "Can't go live: this test release can't be read by this version of Saroh. Make a new test release from your draft.",
            details: { reason: "unrenderable", unrenderable },
        });
    }

    // No web address, nothing live (DEC-069, L5), as publish asks it.
    const site = await tx.site.findUniqueOrThrow({
        where: { id: siteId },
        select: {
            subdomain: true,
            currentPublication: {
                select: {
                    id: true,
                    publishedAt: true,
                    publishedByUserId: true,
                },
            },
        },
    });
    if (!site.subdomain) {
        throw new ConflictException({
            message: ADDRESS_MISSING_MESSAGE,
            details: { field: "subdomain", reason: "addressMissing" },
        });
    }

    const at = input.at ?? new Date();
    const live = await putLive(tx, {
        site: { id: siteId, organizationId },
        // Byte for byte the release, with only its time restamped (R8).
        // `draftFingerprint` ignores `publishedAt`, so an approval of the
        // release still matches the copy.
        snapshot: restamp(snapshot, at),
        source: "go-live",
        actor: { userId: input.actorUserId },
        fingerprint: release.fingerprint,
        template: {
            id: release.publication.templateId,
            version: release.publication.templateVersion,
        },
        publishedAt: at,
        sourcePublicationId: release.publicationId,
    });

    await tx.siteTestRelease.update({
        where: { id: releaseId },
        data: { wentLiveAt: at, livePublicationId: live.publicationId },
        select: { id: true },
    });

    const replaced = site.currentPublication;
    return {
        ...live,
        replaced: replaced
            ? {
                  publicationId: replaced.id,
                  publishedAt: replaced.publishedAt,
                  publishedByUserId: replaced.publishedByUserId,
              }
            : null,
    };
}

/**
 * A release with a live schedule doesn't go live by hand: the job would run
 * after it and find it live, or worse, run first. A job already running is
 * the go-live itself.
 */
async function refuseScheduled(
    tx: Pick<Prisma.TransactionClient, "job">,
    jobId: string | null,
): Promise<never> {
    const job = jobId
        ? await tx.job.findUnique({
              where: { id: jobId },
              select: { status: true },
          })
        : null;
    if (job?.status === "PROCESSING") {
        throw new ConflictException({
            message: RELEASE_GOING_LIVE_MESSAGE,
            details: { reason: "goingLive" },
        });
    }
    throw new ConflictException({
        message: RELEASE_SCHEDULED_MESSAGE,
        details: { reason: "scheduled" },
    });
}

/** The snapshot with `publishedAt` set to `at`, and nothing else changed. */
function restamp(snapshot: unknown, at: Date): unknown {
    if (snapshot === null || typeof snapshot !== "object") return snapshot;
    return {
        ...(snapshot as Record<string, unknown>),
        publishedAt: at.toISOString(),
    };
}
