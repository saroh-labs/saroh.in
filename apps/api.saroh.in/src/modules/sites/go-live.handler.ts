import { ConflictException, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import { businessTimezone } from "../bookings/staff-availability";
import { enqueueTeamAlert } from "../notifications/team-alerts";
import { resolveCapabilities } from "../organizations/organization-policy";
import { lockSite, readVerdicts } from "./live-pointer";
import { goLiveWithRelease } from "./test-release-go-live";
import { releaseApproved } from "./test-release-review";
import type { SiteGoLivePayload } from "./test-release-schedule";
import {
    CLEARED_SCHEDULE,
    localTime,
    SITE_GO_LIVE_TYPE,
} from "./test-release-schedule";

export { SITE_GO_LIVE_TYPE } from "./test-release-schedule";

type Tx = Prisma.TransactionClient;

/** What a run did. `skipped`: there was nothing of its to do. */
export type GoLiveRun =
    | { outcome: "LIVE"; publicationId: string }
    | { outcome: "NOT_LIVE"; reason: string }
    | { outcome: "skipped" };

/**
 * Consumer for `site.go_live` (DEC-071, T10): a test release's scheduled
 * go-live, when its time comes.
 *
 * On one transaction, in the business's RLS context, under a lock on the
 * release row (KTD-13) and then the site's (`lockSite`), so no publish or
 * restore commits between the re-check and the write:
 *  1. **Re-read.** A release cancelled, moved to another time, already live
 *     or discarded since the job was queued is left alone: this run is not
 *     its schedule any more.
 *  2. **Re-check** what the merchant expected when they scheduled it
 *     (KTD-14): the live site is still the version it was scheduled over,
 *     the person who scheduled it can still publish, and, while
 *     "Publishing needs approval" is on, the release is approved or an
 *     owner scheduled it past approval.
 *  3. **Go live** through `goLiveWithRelease`, as the person who scheduled
 *     it, so the review standing is recorded and the site repoints through
 *     `putLive` like every other go-live.
 *  4. **Tell the team** (`team.alert`, event `site`) either way.
 *
 * A clear no-go records `NOT_LIVE` with its reason and clears the schedule,
 * so the merchant can go live now or schedule again; it never retries. A
 * transient failure throws, and the worker retries. On the last attempt the
 * failure is recorded as NOT_LIVE first, so a schedule never hangs as
 * "scheduled" after its job gave up.
 */
@Injectable()
export class GoLiveHandler {
    private readonly logger = new Logger(GoLiveHandler.name);

    readonly handle = async (job: Job): Promise<void> => {
        const payload = payloadOf(job.payload);
        if (!payload || !job.organizationId) {
            this.logger.warn(
                `${SITE_GO_LIVE_TYPE} job ${job.id} names no release; skipped`,
            );
            return;
        }
        const organizationId = job.organizationId;
        try {
            const run = await runInOrgContext(organizationId, () =>
                prisma.$transaction((tx) =>
                    runScheduledGoLive(tx, organizationId, payload),
                ),
            );
            this.logger.log(
                `${SITE_GO_LIVE_TYPE} ${payload.testReleaseId}: ${run.outcome}`,
            );
        } catch (err) {
            if (job.attempts + 1 < job.maxAttempts) throw err;
            // The last try: say it didn't go live before giving up.
            await runInOrgContext(organizationId, () =>
                prisma.$transaction((tx) =>
                    recordGaveUp(tx, organizationId, payload),
                ),
            );
            throw err;
        }
    };
}

/** Run one scheduled go-live, inside the caller's transaction. */
export async function runScheduledGoLive(
    tx: Tx,
    organizationId: string,
    payload: SiteGoLivePayload,
    now: Date = new Date(),
): Promise<GoLiveRun> {
    const release = await lockedRelease(tx, organizationId, payload);
    if (!release?.scheduledByUserId || !release.goLiveAt) {
        return { outcome: "skipped" };
    }
    const schedulerId = release.scheduledByUserId;

    // The site's lock before its live pointer is read: a publish or restore
    // in flight commits first and is seen as "published since", or waits
    // for this run. Without it a publish could commit between the check
    // and `putLive`, and the older release would replace the fix (KTD-14).
    await lockSite(tx, release.siteId);
    const check = await mayGoLive(tx, organizationId, release, now);
    if (!check.go) {
        const { reason } = check;
        await notLive(tx, organizationId, release, reason, schedulerId);
        return { outcome: "NOT_LIVE", reason };
    }

    let publicationId: string;
    try {
        const live = await goLiveWithRelease(tx, {
            siteId: release.siteId,
            organizationId,
            releaseId: release.id,
            actorUserId: schedulerId,
            actorIsOwner: check.owner,
            // The owner's override stored with the schedule, so `putLive`
            // records it as OVERRIDDEN, as going live by hand would (T9).
            override: check.override,
            at: now,
            scheduledFor: release.goLiveAt,
        });
        publicationId = live.publicationId;
    } catch (err) {
        // A release this build can't draw, or a site with no address: a
        // clear no-go, said in the words going live by hand would use.
        // Both are refused before anything is written.
        if (err instanceof ConflictException) {
            const reason = messageOf(err);
            await notLive(tx, organizationId, release, reason, schedulerId);
            return { outcome: "NOT_LIVE", reason };
        }
        throw err;
    }

    await tx.siteTestRelease.update({
        where: { id: release.id },
        data: { lastGoLiveOutcome: "LIVE", lastGoLiveReason: null },
        select: { id: true },
    });
    await enqueueTeamAlert(tx, organizationId, {
        event: "site",
        testReleaseId: release.id,
        goLiveAt: payload.goLiveAt,
        outcome: "LIVE",
        schedulerUserId: schedulerId,
    });
    return { outcome: "LIVE", publicationId };
}

type LockedRelease = NonNullable<Awaited<ReturnType<typeof lockedRelease>>>;

/**
 * The release, locked, if this run is still its schedule: scheduled for
 * exactly the payload's instant, and neither live nor discarded.
 */
async function lockedRelease(
    tx: Tx,
    organizationId: string,
    payload: SiteGoLivePayload,
) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "SiteTestRelease"
        WHERE id = ${payload.testReleaseId}
          AND "organizationId" = ${organizationId}
        FOR UPDATE`;
    if (locked.length === 0) return null;
    const release = await tx.siteTestRelease.findUniqueOrThrow({
        where: { id: payload.testReleaseId },
        select: {
            id: true,
            siteId: true,
            name: true,
            fingerprint: true,
            goLiveAt: true,
            goLiveZone: true,
            scheduledByUserId: true,
            scheduledOverPublicationId: true,
            scheduleOverride: true,
            wentLiveAt: true,
            discardedAt: true,
        },
    });
    const current =
        release.goLiveAt?.toISOString() === payload.goLiveAt &&
        !release.wentLiveAt &&
        !release.discardedAt;
    return current ? release : null;
}

/**
 * Whether this schedule may go live now (KTD-14). No: why, in the
 * merchant's words, each reason ending with what they can do next. Yes:
 * whether it goes live on the owner's override, and whether the scheduler
 * is an owner now, which is what `putLive` takes an override from.
 */
type GoLiveCheck =
    | { go: false; reason: string }
    | { go: true; override: boolean; owner: boolean };

async function mayGoLive(
    tx: Tx,
    organizationId: string,
    release: LockedRelease,
    now: Date,
): Promise<GoLiveCheck> {
    const no = (reason: string): GoLiveCheck => ({ go: false, reason });
    const again = "Go live now, or schedule it again.";
    const site = await tx.site.findFirst({
        where: { id: release.siteId, organizationId },
        select: {
            deletedAt: true,
            publishNeedsApproval: true,
            currentPublication: { select: { id: true, publishedAt: true } },
        },
    });
    if (!site || site.deletedAt) return no("The site was deleted.");

    // Published since: a scheduled older version must never wipe out a
    // later fix (KTD-14, Q2).
    const live = site.currentPublication;
    if ((live?.id ?? null) !== release.scheduledOverPublicationId) {
        const zone =
            release.goLiveZone ?? (await businessTimezone(tx, organizationId));
        const when = live ? localTime(live.publishedAt, zone, now) : null;
        return no(
            when
                ? `The site was published at ${when}, after this was scheduled. ${again}`
                : `The site's live version changed after this was scheduled. ${again}`,
        );
    }

    const scheduler = await schedulerStanding(
        tx,
        organizationId,
        release.scheduledByUserId ?? "",
    );
    if (!scheduler.member) {
        return no(
            `${scheduler.name}, who scheduled it, is no longer on the team. ${again}`,
        );
    }
    if (!scheduler.canPublish) {
        return no(
            `${scheduler.name}, who scheduled it, can no longer publish the site. ${again}`,
        );
    }

    let override = false;
    if (site.publishNeedsApproval) {
        const approved = releaseApproved(
            await readVerdicts(tx, { siteId: release.siteId, organizationId }),
            release,
            release.scheduledByUserId ?? "",
        );
        // An owner's override holds only while they are still an owner.
        const overridden = release.scheduleOverride && scheduler.owner;
        if (!approved && !overridden) {
            return no(
                "Publishing needs approval, and this test release isn't approved. Get it approved, then go live or schedule it again.",
            );
        }
        override = !approved && overridden;
    }
    return { go: true, override, owner: scheduler.owner };
}

/** Who scheduled it, as the business sees them now. */
async function schedulerStanding(
    tx: Tx,
    organizationId: string,
    userId: string,
): Promise<{
    name: string;
    member: boolean;
    canPublish: boolean;
    owner: boolean;
}> {
    const [user, membership] = await Promise.all([
        tx.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true },
        }),
        tx.membership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { role: true, extraActions: true },
        }),
    ]);
    // `||`: an empty name falls through to the email.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const name = user?.name?.trim() || user?.email || "The person";
    if (!membership) {
        return { name, member: false, canPublish: false, owner: false };
    }
    const stored = await tx.organizationRole.findUnique({
        where: {
            organizationId_key: { organizationId, key: membership.role },
        },
        select: { actions: true },
    });
    // What they may do now, resolved as a request of theirs would be.
    const actions = resolveCapabilities(
        membership.role,
        stored?.actions,
        membership.extraActions,
    );
    return {
        name,
        member: true,
        canPublish: actions.has("site:publish"),
        owner: membership.role === "OWNER",
    };
}

/** Record a no-go, clear the schedule, and tell the team. */
async function notLive(
    tx: Tx,
    organizationId: string,
    release: { id: string; goLiveAt: Date | null },
    reason: string,
    schedulerId: string,
): Promise<void> {
    await tx.siteTestRelease.update({
        where: { id: release.id },
        data: {
            ...CLEARED_SCHEDULE,
            lastGoLiveOutcome: "NOT_LIVE",
            lastGoLiveReason: reason,
        },
        select: { id: true },
    });
    await enqueueTeamAlert(tx, organizationId, {
        event: "site",
        testReleaseId: release.id,
        goLiveAt: release.goLiveAt?.toISOString() ?? "",
        outcome: "NOT_LIVE",
        reason,
        schedulerUserId: schedulerId,
    });
}

/**
 * The last attempt failed for a reason nobody could name: record that it
 * didn't go live, if this run is still the release's schedule.
 */
export async function recordGaveUp(
    tx: Tx,
    organizationId: string,
    payload: SiteGoLivePayload,
): Promise<void> {
    const release = await lockedRelease(tx, organizationId, payload);
    if (!release?.scheduledByUserId) return;
    await notLive(
        tx,
        organizationId,
        release,
        "Something went wrong putting it live. Go live now, or schedule it again.",
        release.scheduledByUserId,
    );
}

function messageOf(err: ConflictException): string {
    const body: unknown = err.getResponse();
    if (typeof body === "object" && body !== null && "message" in body) {
        const { message } = body;
        if (typeof message === "string") return message;
    }
    return err.message;
}

export function payloadOf(value: unknown): SiteGoLivePayload | null {
    if (typeof value !== "object" || value === null) return null;
    const p = value as Record<string, unknown>;
    if (typeof p.testReleaseId !== "string" || p.testReleaseId === "") {
        return null;
    }
    if (
        typeof p.goLiveAt !== "string" ||
        Number.isNaN(Date.parse(p.goLiveAt))
    ) {
        return null;
    }
    return { testReleaseId: p.testReleaseId, goLiveAt: p.goLiveAt };
}
