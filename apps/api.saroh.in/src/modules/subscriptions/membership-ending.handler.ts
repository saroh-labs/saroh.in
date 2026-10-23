import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";
import { DateTime } from "luxon";

import { noticeOn } from "../communications/notice-settings";
import { BILLING_ORGANIZATION } from "../organizations/organization-lifecycle.policy";
import {
    CUSTOMER_NOTIFY_TYPE,
    enqueueCustomerNotice,
} from "../site-accounts/customer-notify-queue";
import { membershipEndingNoticeKey } from "../site-accounts/notices/membership-ending";

/** The daily sweep's job type. */
export const MEMBERSHIP_ENDING_TYPE = "membership.ending-notice";

/** How often it runs. */
export const MEMBERSHIP_ENDING_EVERY_MS = 24 * 60 * 60 * 1000;

/** How many days ahead a member is told. */
export const MEMBERSHIP_ENDING_DAYS = 7;

/** Memberships read a page at a time, and pages a run. */
const PAGE = 200;
const MAX_PAGES = 25;

/** The key that lets one waiting run of the chain exist at a time. */
const CHAIN_LOCK = `job-chain:${MEMBERSHIP_ENDING_TYPE}`;

type Tx = Prisma.TransactionClient;

/**
 * Whether a membership set to end is told now that it ends, in its own
 * zone. Pure.
 *
 * - Its end is 1 to 7 days away by the calendar of its zone. A run missed
 *   still tells it on a later day of that week; the claim key
 *   (`membershipEndingNoticeKey`) makes it once.
 * - The cancel came before that week began: a member who cancels with a
 *   few days left has just been emailed the day it ends
 *   (MEMBERSHIP_CANCELLED), so this would only repeat it. A membership
 *   with no cancel on record (one set to end before the log) counts as
 *   cancelled long ago.
 */
export function endingNoticeDue(input: {
    endsAt: Date;
    timeZone: string;
    /** When it was set to end; null when the log doesn't say. */
    scheduledAt: Date | null;
    now: Date;
}): boolean {
    const { endsAt, now } = input;
    if (endsAt.getTime() <= now.getTime()) return false;
    const zone = DateTime.local().setZone(input.timeZone).isValid
        ? input.timeZone
        : "Asia/Kolkata";
    const today = DateTime.fromJSDate(now, { zone }).startOf("day");
    const endDay = DateTime.fromJSDate(endsAt, { zone }).startOf("day");
    const daysLeft = Math.round(endDay.diff(today, "days").days);
    if (daysLeft < 1 || daysLeft > MEMBERSHIP_ENDING_DAYS) return false;
    const weekBefore = endDay.minus({ days: MEMBERSHIP_ENDING_DAYS });
    return (
        input.scheduledAt === null ||
        input.scheduledAt.getTime() < weekBefore.toJSDate().getTime()
    );
}

export type EndingOutcome =
    /** Not due, or no longer set to end. */
    | "not_due"
    /** Membership emails are off. */
    | "off"
    /** Told already, or waiting to be. */
    | "already"
    | "queued";

/**
 * "Your membership ends on ‹date›" a week before (DEC-174 U19, #1150): a
 * daily sweep over memberships set to end with their period
 * (`cancelAtPeriodEnd`), at a business still billing, that queues
 * MEMBERSHIP_ENDING for each one due (`endingNoticeDue`), keyed
 * `membership-ending:<subscriptionId>:<periodEnd>`, while the business has
 * Membership emails on. The notice is read again when it goes, so one kept
 * in between says nothing.
 *
 * Each membership is queued on its own transaction in its business's
 * context; one that fails is logged and the rest go on. A run never
 * re-reads a membership it has passed (paged by id).
 *
 * It reschedules itself (ADR-007), one waiting run at a time under the
 * advisory lock `job-chain:membership.ending-notice`, as the commission
 * sweep does, so it needed no migration; it throws only when the next run
 * can't be enqueued. A timer (`ensureScheduled`) restarts a chain that
 * stopped.
 */
@Injectable()
export class MembershipEndingHandler {
    private readonly logger = new Logger(MembershipEndingHandler.name);

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const r = await this.sweep(now);
            if (r.queued + r.failed > 0) {
                this.logger.log(
                    `membership_ending queued=${r.queued} failed=${r.failed}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `membership_ending failed before it finished: ${String(error)}`,
            );
        }
        const next = new Date(now.getTime() + MEMBERSHIP_ENDING_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next membership-ending sweep; retrying this one",
            );
        }
    };

    /** Queue every notice due now. */
    async sweep(now: Date): Promise<{ queued: number; failed: number }> {
        const result = { queued: 0, failed: 0 };
        // A day of slack past the week: the zone's calendar decides.
        const horizon = new Date(
            now.getTime() + (MEMBERSHIP_ENDING_DAYS + 1) * 24 * 60 * 60 * 1000,
        );
        let after = "";
        for (let page = 0; page < MAX_PAGES; page++) {
            const subs = await prisma.customerSubscription.findMany({
                where: {
                    id: { gt: after },
                    status: { in: ["ACTIVE", "PAUSED"] },
                    cancelAtPeriodEnd: true,
                    currentPeriodEnd: { gt: now, lte: horizon },
                    organization: BILLING_ORGANIZATION,
                },
                orderBy: { id: "asc" },
                take: PAGE,
                select: { id: true, organizationId: true },
            });
            for (const sub of subs) {
                try {
                    const outcome = await runInOrgContext(
                        sub.organizationId,
                        () =>
                            prisma.$transaction((tx) =>
                                queueEndingNotice(
                                    tx,
                                    sub.organizationId,
                                    sub.id,
                                    now,
                                ),
                            ),
                    );
                    if (outcome === "queued") result.queued += 1;
                } catch (error) {
                    result.failed += 1;
                    this.logger.error(
                        `membership_ending subscription=${sub.id} organization=${sub.organizationId}: ${String(error)}`,
                    );
                }
            }
            if (subs.length < PAGE) break;
            after = subs[subs.length - 1].id;
        }
        return result;
    }

    /** Leave one run waiting at `runAt`, unless one is. Never throws. */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: { type: MEMBERSHIP_ENDING_TYPE, status: "PENDING" },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: { type: MEMBERSHIP_ENDING_TYPE, payload: {}, runAt },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next membership-ending sweep: ${String(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. Never throws. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: MEMBERSHIP_ENDING_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the membership-ending chain: ${String(error)}`,
            );
        }
    }
}

/**
 * Queue one membership's notice when it is due, on the caller's
 * transaction (in its business's context). Read again here: the sweep's
 * list may be a moment old.
 */
export async function queueEndingNotice(
    tx: Tx,
    organizationId: string,
    subscriptionId: string,
    now: Date,
): Promise<EndingOutcome> {
    const sub = await tx.customerSubscription.findFirst({
        where: { id: subscriptionId, organizationId },
        select: {
            status: true,
            cancelAtPeriodEnd: true,
            currentPeriodEnd: true,
            timezone: true,
        },
    });
    if (
        !sub ||
        (sub.status !== "ACTIVE" && sub.status !== "PAUSED") ||
        !sub.cancelAtPeriodEnd
    ) {
        return "not_due";
    }
    const cancel = await tx.subscriptionEvent.findFirst({
        where: { organizationId, subscriptionId, kind: "CANCEL_SCHEDULED" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
    });
    if (
        !endingNoticeDue({
            endsAt: sub.currentPeriodEnd,
            timeZone: sub.timezone,
            scheduledAt: cancel?.createdAt ?? null,
            now,
        })
    ) {
        return "not_due";
    }
    if (!(await noticeOn(tx, organizationId, "MEMBERSHIP"))) return "off";

    const eventKey = membershipEndingNoticeKey(
        subscriptionId,
        sub.currentPeriodEnd,
    );
    // Told already, or waiting to go: the job's own claim makes it once
    // anyway; this keeps a daily run from queueing it again every day.
    const [told, waiting] = await Promise.all([
        tx.customerNotice.findUnique({
            where: { organizationId_eventKey: { organizationId, eventKey } },
            select: { id: true },
        }),
        tx.job.findFirst({
            where: {
                organizationId,
                type: CUSTOMER_NOTIFY_TYPE,
                status: { in: ["PENDING", "PROCESSING"] },
                payload: { path: ["eventKey"], equals: eventKey },
            },
            select: { id: true },
        }),
    ]);
    if (told || waiting) return "already";

    await enqueueCustomerNotice(tx, organizationId, {
        kind: "MEMBERSHIP_ENDING",
        eventKey,
        subscriptionId,
        periodEnd: sub.currentPeriodEnd.toISOString(),
    });
    return "queued";
}
