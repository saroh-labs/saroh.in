import type { Prisma } from "@saroh/database";

import { ForbiddenException } from "@nestjs/common";

import {
    AuditAction,
    auditMetadata,
    AuditOutcome,
} from "../audit/audit.service";
import {
    approvalRequired,
    OVERRIDE_OWNER_ONLY_MESSAGE,
} from "./publish-approval";
import type { ReviewStanding } from "./review-route";
import { ReviewRoute, reviewStanding } from "./review-route";
import type { VerdictRow } from "./test-release-review";
import {
    draftVerdicts,
    releaseApproved,
    releaseStanding,
} from "./test-release-review";

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
 * It is also where "Publishing needs approval" is enforced (DEC-071, R10,
 * `publish-approval.ts`), for the same reason: a way of going live that
 * doesn't come through here can't exist, so none can forget the setting.
 *
 * Callers own everything before the write: who may, which snapshot, whether
 * it can be drawn. `putLive` owns the write.
 */

/** Which act put the version live. Says why, in logs and in tests. */
export type LiveSource = "publish" | "restore" | "go-live";

/** What `putLive` needs of a transaction client, and nothing more. */
export type LiveTx = Pick<
    Prisma.TransactionClient,
    "publication" | "site" | "siteApproval" | "auditEvent" | "$queryRaw"
>;

/**
 * Lock the site's row for the rest of the transaction, so publish, restore
 * and go-live (by hand or scheduled) put a version live one at a time.
 *
 * `putLive` takes it first. A caller that decides from the live pointer
 * whether to go live at all (the scheduled go-live, KTD-14) takes it before
 * it reads the pointer, so a publish can't commit between its check and its
 * write. Under READ COMMITTED, a read after the lock sees whatever the
 * previous holder committed.
 *
 * FOR NO KEY UPDATE, not FOR UPDATE: it conflicts with every other putLive
 * and every write to the site, but not with the FOR KEY SHARE an insert
 * naming the site takes (a Publication, an approval, a page), so edits and
 * test releases made while a version goes live wait for nothing
 * (`backend-data-and-money.md`, locks).
 */
export async function lockSite(
    tx: Pick<Prisma.TransactionClient, "$queryRaw">,
    siteId: string,
): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Site" WHERE id = ${siteId} FOR NO KEY UPDATE`;
}

/**
 * Which rule "Publishing needs approval" applies (R10): a publish or a
 * restore goes live DIRECT, which the setting refuses; a test release goes
 * live through its RELEASE gate, which the setting lets through once it is
 * approved.
 */
export type LiveGate = "direct" | "release";

/** The gate a source goes through. */
export function gateOf(source: LiveSource): LiveGate {
    return source === "go-live" ? "release" : "direct";
}

export interface PutLiveInput {
    site: { id: string; organizationId: string };
    /** The snapshot to serve, exactly as it will be stored. */
    snapshot: unknown;
    source: LiveSource;
    /**
     * Who is putting it live: the publisher on the record. `owner`: they are
     * an owner of the business now, the only one an override is taken from.
     */
    actor: { userId: string; owner?: boolean };
    /**
     * An owner going live past "Publishing needs approval" (KTD-11). 403
     * from anyone else. Recorded as OVERRIDDEN only when the setting is on
     * and nothing approved what goes live; otherwise it changes nothing.
     */
    override?: boolean;
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
    /**
     * The test release going live (T8). Its review is read from the verdicts
     * given on a release (KTD-10), not the draft's, and a bypass record names
     * it, so the draft's own review never reads a release's go-live.
     */
    testReleaseId?: string | null;
}

export interface PutLiveResult {
    publicationId: string;
    publishedAt: Date;
    /**
     * True when it went live past an outstanding review (#199, #279), and
     * that was recorded as a bypass. An override is recorded as itself.
     */
    bypassed: boolean;
    /** True when an owner went live past "Publishing needs approval". */
    overridden: boolean;
    route: ReviewRoute;
}

/**
 * Put `snapshot` live for `site`, inside the caller's transaction.
 *
 * The review standing and the approval setting are both asked of `tx`,
 * beside the write (#278): a verdict posted, or the setting switched, while
 * this is in flight is either seen or lands after it.
 *
 * Refused before anything is written: 403 for an override from anyone but
 * an owner, and 409 `APPROVAL_REQUIRED` while the setting is on, unless a
 * test release approved by someone else is going live, or an owner
 * overrides.
 */
export async function putLive(
    tx: LiveTx,
    input: PutLiveInput,
): Promise<PutLiveResult> {
    const { site, actor } = input;
    if (input.override === true && actor.owner !== true) {
        throw new ForbiddenException(OVERRIDE_OWNER_ONLY_MESSAGE);
    }
    const gate = gateOf(input.source);
    // One version goes live at a time, and every read below is of what the
    // previous one left.
    await lockSite(tx, site.id);

    const [settings, verdicts] = await Promise.all([
        tx.site.findUniqueOrThrow({
            where: { id: site.id },
            select: { publishNeedsApproval: true },
        }),
        readVerdicts(tx, {
            siteId: site.id,
            organizationId: site.organizationId,
        }),
    ]);
    // Going live with a release asks the release's reviewers; publish and
    // restore ask the draft's (KTD-10).
    const standing = standingOf(verdicts, {
        fingerprint: input.fingerprint,
        publisherUserId: actor.userId,
        scope: gate === "release" ? "release" : "draft",
    });

    // "Publishing needs approval" (R10). Off: DEC-047 stands, and nothing
    // here is refused. On: only a release someone else approved goes live,
    // and an owner's override is the one way past it.
    const approved =
        gate === "release" &&
        releaseApproved(
            verdicts,
            { fingerprint: input.fingerprint },
            actor.userId,
        );
    const overridden = settings.publishNeedsApproval && !approved;
    if (overridden && input.override !== true) throw approvalRequired();

    // An override is recorded as itself, not as a bypass as well: one row
    // says what happened (KTD-11).
    const route: ReviewRoute = overridden
        ? ReviewRoute.Overridden
        : standing.route;
    const bypassed = !overridden && standing.outstanding;

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
            reviewRoute: route,
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

    if (overridden) {
        await recordOverride(tx, input, publication.id);
    } else if (bypassed) {
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
                ...(input.testReleaseId
                    ? { testReleaseId: input.testReleaseId }
                    : {}),
            },
            select: { id: true },
        });
    }

    return {
        publicationId: publication.id,
        publishedAt: publication.publishedAt,
        bypassed,
        overridden,
        route,
    };
}

/**
 * An owner's override, written down the three ways KTD-11 asks: the
 * publication's route (the caller's row), an OVERRIDDEN approval linked to
 * it, which version history and the review history read, and an audit
 * event, which the business's activity reads.
 */
async function recordOverride(
    tx: LiveTx,
    input: PutLiveInput,
    publicationId: string,
): Promise<void> {
    const { site, actor } = input;
    await tx.siteApproval.create({
        data: {
            siteId: site.id,
            organizationId: site.organizationId,
            byUserId: actor.userId,
            outcome: ReviewRoute.Overridden,
            publicationId,
            ...(input.testReleaseId
                ? { testReleaseId: input.testReleaseId }
                : {}),
        },
        select: { id: true },
    });
    await tx.auditEvent.create({
        data: {
            action: AuditAction.SitePublishOverride,
            actorUserId: actor.userId,
            organizationId: site.organizationId,
            targetType: "publication",
            targetId: publicationId,
            outcome: AuditOutcome.Success,
            metadata: auditMetadata(undefined, {
                siteId: site.id,
                source: input.source,
                ...(input.testReleaseId
                    ? { testReleaseId: input.testReleaseId }
                    : {}),
            }),
        },
        select: { id: true },
    });
}

/**
 * Whose review is asked about: the draft's (publish, restore), or a test
 * release's (go live), which reads only the verdicts given on a release
 * with its fingerprint (KTD-10, `test-release-review.ts`).
 */
export type ReviewScope = "draft" | "release";

/**
 * Every verdict on the site, newest first, asked of `client` so a
 * transaction gets its own answer (#278). Verdicts only: BYPASSED and
 * OVERRIDDEN are going live's own records, and must not settle the request
 * they were written about.
 */
export async function readVerdicts(
    client: Pick<Prisma.TransactionClient, "siteApproval">,
    input: { siteId: string; organizationId: string },
): Promise<VerdictRow[]> {
    return client.siteApproval.findMany({
        where: {
            siteId: input.siteId,
            organizationId: input.organizationId,
            outcome: { in: ["REQUESTED", "APPROVED", "CHANGES_REQUESTED"] },
        },
        // Two reviews can share a millisecond; the id (a cuid, which grows)
        // keeps "newest" deterministic.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
            outcome: true,
            byUserId: true,
            draftFingerprint: true,
            createdAt: true,
            testReleaseId: true,
        },
    });
}

/**
 * Where the site stands with its reviewers for `fingerprint`: the draft's
 * review, or a release's (`scope`).
 */
export async function readReviewStanding(
    client: Pick<Prisma.TransactionClient, "siteApproval">,
    input: {
        siteId: string;
        organizationId: string;
        fingerprint: string;
        publisherUserId: string | null;
        scope: ReviewScope;
    },
): Promise<ReviewStanding> {
    return standingOf(await readVerdicts(client, input), input);
}

/** Where `verdicts` leave the draft's review, or a release's (`scope`). */
function standingOf(
    verdicts: VerdictRow[],
    input: {
        fingerprint: string;
        publisherUserId: string | null;
        scope: ReviewScope;
    },
): ReviewStanding {
    return input.scope === "release"
        ? releaseStanding(
              verdicts,
              { fingerprint: input.fingerprint },
              input.publisherUserId,
          )
        : reviewStanding(
              draftVerdicts(verdicts),
              input.fingerprint,
              input.publisherUserId,
          );
}
