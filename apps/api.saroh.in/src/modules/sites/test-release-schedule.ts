import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { readReviewStanding } from "./live-pointer";
import { ReviewRoute } from "./review-route";
import { ADDRESS_MISSING_MESSAGE } from "./site-flags";
import {
    RELEASE_DISCARDED_MESSAGE,
    RELEASE_GOING_LIVE_MESSAGE,
    RELEASE_LIVE_MESSAGE,
} from "./test-release-go-live";

/**
 * A scheduled go-live (DEC-071, T10): "Go live at Fri 6:00pm", chosen in the
 * business's time zone, cancelled until it runs.
 *
 * The schedule is two rows written in one transaction (KTD-13): the
 * release's schedule columns and a `site.go_live` Job whose `runAt` is the
 * instant. The release row is the lock: scheduling, cancelling and the run
 * (`go-live.handler.ts`) each take it `FOR UPDATE`, and cancelling deletes
 * the job only while it is still PENDING. A job already PROCESSING is the
 * go-live itself, and answers "going live now".
 */

/** The job type. Its handler is `go-live.handler.ts`. */
export const SITE_GO_LIVE_TYPE = "site.go_live";

/** What the job carries: ids and the instant it was queued for, nothing else. */
export interface SiteGoLivePayload {
    testReleaseId: string;
    /** ISO instant. A release rescheduled since holds a different one. */
    goLiveAt: string;
}

/** The nearest a go-live can be scheduled, so there is time to cancel it. */
export const SCHEDULE_MIN_AHEAD_MS = 5 * 60 * 1000;
/** The furthest ahead: a release is a test, not a plan for next quarter. */
export const SCHEDULE_MAX_AHEAD_DAYS = 60;

export const APPROVAL_REQUIRED_MESSAGE =
    "This site goes live only from an approved test release.";
export const OVERRIDE_OWNER_ONLY_MESSAGE =
    "Only an owner can go live without approval.";

/**
 * The instant a local date and time name in `zone`, or a 400 saying why not.
 *
 * Luxon moves a time that doesn't exist (the hour the clocks skip) to one
 * that does, so the answer is read back: a time that doesn't come out as
 * it went in never happens on that day, and is refused rather than moved.
 * A time that happens twice (the hour the clocks repeat) is the first.
 */
export function scheduleInstant(
    date: string,
    time: string,
    zone: string,
): Date {
    const local = DateTime.fromISO(`${date}T${time}`, { zone });
    if (!local.isValid) {
        throw new BadRequestException({
            message: "Pick a date and a time to go live.",
            details: { reason: "invalidTime" },
        });
    }
    if (local.toFormat("yyyy-MM-dd'T'HH:mm") !== `${date}T${time}`) {
        throw new BadRequestException({
            message: `${time} doesn't happen on ${date} in ${zone}: the clocks go forward. Pick another time.`,
            details: { reason: "skippedTime" },
        });
    }
    return local.toUTC().toJSDate();
}

/** A 400 unless `at` is at least 5 minutes and at most 60 days from `now`. */
export function assertScheduleWindow(at: Date, now: Date): void {
    const ahead = at.getTime() - now.getTime();
    if (ahead < SCHEDULE_MIN_AHEAD_MS) {
        throw new BadRequestException({
            message:
                "Pick a time at least 5 minutes from now, or go live now instead.",
            details: { reason: "tooSoon" },
        });
    }
    if (ahead > SCHEDULE_MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000) {
        throw new BadRequestException({
            message: `Pick a time in the next ${SCHEDULE_MAX_AHEAD_DAYS} days.`,
            details: { reason: "tooFar" },
        });
    }
}

/**
 * A time as the merchant reads it, in their zone: "3:10pm" today,
 * "Fri 3 Oct, 3:10pm" on any other day.
 */
export function localTime(at: Date, zone: string, now: Date): string {
    const when = DateTime.fromJSDate(at, { zone });
    const clock = when.toFormat("h:mma").toLowerCase();
    const today = DateTime.fromJSDate(now, { zone });
    return when.hasSame(today, "day")
        ? clock
        : `${when.toFormat("ccc d LLL")}, ${clock}`;
}

type ScheduleTx = Pick<
    Prisma.TransactionClient,
    "$queryRaw" | "siteTestRelease" | "site" | "siteApproval" | "job"
>;

export interface ScheduleInput {
    siteId: string;
    organizationId: string;
    releaseId: string;
    actorUserId: string;
    /** The owner chose to go live without approval (KTD-11). */
    override: boolean;
    goLiveAt: Date;
    zone: string;
    now: Date;
}

/**
 * Schedule (or move) a release's go-live, inside the caller's transaction.
 *
 * Refused (409) for a release that is discarded or live, for one whose
 * go-live is already running, while another release of the site is
 * scheduled, for a site with no web address, and, while "Publishing needs
 * approval" is on, for a release that isn't approved without an owner's
 * override. A release already scheduled is moved: its waiting job is
 * deleted and a new one queued.
 */
export async function scheduleGoLive(
    tx: ScheduleTx,
    input: ScheduleInput,
): Promise<void> {
    const release = await lockRelease(tx, input);
    if (release.wentLiveAt) throw conflict(RELEASE_LIVE_MESSAGE, "live");
    if (release.discardedAt) {
        throw conflict(RELEASE_DISCARDED_MESSAGE, "discarded");
    }
    if (release.goLiveAt) await dropWaitingJob(tx, release.goLiveJobId);

    const other = await tx.siteTestRelease.findFirst({
        where: {
            siteId: input.siteId,
            organizationId: input.organizationId,
            id: { not: input.releaseId },
            goLiveAt: { not: null },
            wentLiveAt: null,
            discardedAt: null,
        },
        select: { name: true, goLiveAt: true, goLiveZone: true },
    });
    if (other?.goLiveAt) {
        const when = localTime(
            other.goLiveAt,
            other.goLiveZone ?? input.zone,
            input.now,
        );
        throw conflict(
            `"${other.name}" is already scheduled to go live at ${when}. Cancel that first.`,
            "otherScheduled",
        );
    }

    const site = await tx.site.findUniqueOrThrow({
        where: { id: input.siteId },
        select: {
            subdomain: true,
            publishNeedsApproval: true,
            currentPublicationId: true,
        },
    });
    if (!site.subdomain) {
        throw new ConflictException({
            message: ADDRESS_MISSING_MESSAGE,
            details: { field: "subdomain", reason: "addressMissing" },
        });
    }

    let override = false;
    if (site.publishNeedsApproval) {
        const approved = await releaseApprovedFor(tx, {
            siteId: input.siteId,
            organizationId: input.organizationId,
            fingerprint: release.fingerprint,
            userId: input.actorUserId,
        });
        if (!approved && !input.override) {
            throw new ConflictException({
                message: APPROVAL_REQUIRED_MESSAGE,
                details: {
                    code: "APPROVAL_REQUIRED",
                    reason: "approvalRequired",
                },
            });
        }
        override = input.override;
    }

    // The outbox write, beside the schedule it runs (backend-jobs.md).
    const payload: SiteGoLivePayload = {
        testReleaseId: input.releaseId,
        goLiveAt: input.goLiveAt.toISOString(),
    };
    const job = await tx.job.create({
        data: {
            organizationId: input.organizationId,
            type: SITE_GO_LIVE_TYPE,
            runAt: input.goLiveAt,
            payload: payload as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
    });
    await tx.siteTestRelease.update({
        where: { id: input.releaseId },
        data: {
            goLiveAt: input.goLiveAt,
            goLiveZone: input.zone,
            scheduledByUserId: input.actorUserId,
            // If the site is published after this, the schedule doesn't run
            // (KTD-14).
            scheduledOverPublicationId: site.currentPublicationId,
            scheduleOverride: override,
            goLiveJobId: job.id,
            // A new schedule, so the last attempt's words no longer apply.
            lastGoLiveOutcome: null,
            lastGoLiveReason: null,
        },
        select: { id: true },
    });
}

/**
 * Cancel a release's scheduled go-live, inside the caller's transaction:
 * the schedule is cleared and its waiting job deleted, together. Refused
 * (409) once the job is running. A release with no schedule is left as it
 * is, so cancelling twice is not an error.
 */
export async function cancelGoLive(
    tx: ScheduleTx,
    input: Pick<ScheduleInput, "siteId" | "organizationId" | "releaseId">,
): Promise<void> {
    const release = await lockRelease(tx, input);
    if (!release.goLiveAt || release.wentLiveAt || release.discardedAt) return;
    await dropWaitingJob(tx, release.goLiveJobId);
    await tx.siteTestRelease.update({
        where: { id: input.releaseId },
        data: CLEARED_SCHEDULE,
        select: { id: true },
    });
}

/** The schedule columns, emptied. */
export const CLEARED_SCHEDULE = {
    goLiveAt: null,
    goLiveZone: null,
    scheduledByUserId: null,
    scheduledOverPublicationId: null,
    scheduleOverride: false,
    goLiveJobId: null,
} as const satisfies Prisma.SiteTestReleaseUpdateInput;

/**
 * Whether the release is approved for `userId` to put live: an approval of
 * its fingerprint by someone else settles its review (KTD-10). Asked of
 * `tx`, as `putLive` asks it, so both give the same answer.
 */
export async function releaseApprovedFor(
    tx: Pick<Prisma.TransactionClient, "siteApproval">,
    input: {
        siteId: string;
        organizationId: string;
        fingerprint: string;
        userId: string;
    },
): Promise<boolean> {
    const standing = await readReviewStanding(tx, {
        siteId: input.siteId,
        organizationId: input.organizationId,
        fingerprint: input.fingerprint,
        publisherUserId: input.userId,
    });
    return standing.route === ReviewRoute.Approved;
}

async function lockRelease(
    tx: ScheduleTx,
    input: Pick<ScheduleInput, "siteId" | "organizationId" | "releaseId">,
) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "SiteTestRelease"
        WHERE id = ${input.releaseId}
          AND "siteId" = ${input.siteId}
          AND "organizationId" = ${input.organizationId}
        FOR UPDATE`;
    if (locked.length === 0) {
        throw new NotFoundException(
            `Test release "${input.releaseId}" not found`,
        );
    }
    return tx.siteTestRelease.findUniqueOrThrow({
        where: { id: input.releaseId },
        select: {
            fingerprint: true,
            discardedAt: true,
            wentLiveAt: true,
            goLiveAt: true,
            goLiveJobId: true,
        },
    });
}

/**
 * Delete the schedule's job while it is still waiting. Fenced on PENDING
 * in the delete itself, so a worker that claimed it a moment ago keeps it,
 * and this answers "going live now" instead. A job that already finished
 * (it ran and found nothing to do, or gave up) has nothing to delete.
 */
async function dropWaitingJob(
    tx: Pick<Prisma.TransactionClient, "job">,
    jobId: string | null,
): Promise<void> {
    if (!jobId) return;
    const { count } = await tx.job.deleteMany({
        where: { id: jobId, status: "PENDING" },
    });
    if (count > 0) return;
    const job = await tx.job.findUnique({
        where: { id: jobId },
        select: { status: true },
    });
    if (job?.status === "PROCESSING") {
        throw conflict(RELEASE_GOING_LIVE_MESSAGE, "goingLive");
    }
}

function conflict(message: string, reason: string): ConflictException {
    return new ConflictException({ message, details: { reason } });
}
