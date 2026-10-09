import type { Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { businessTimezone } from "../bookings/staff-availability";
import { paperDay } from "../invoices/invoice-paper-view";
import { enqueueBillingEmail } from "./billing-email.job";
import type { PausesWords } from "./billing-emails";
import { moveDownNotice } from "./billing-emails";
import { CatalogueAccessService } from "./catalogue-access.service";
import type { PauseMeasure } from "./over-limit";
import {
    anythingPauses,
    claimStands,
    MOVE_DOWN_CLAIM_KIND,
    moveDownClaimKey,
    pauseDate,
    pauseLines,
    summaryOf,
} from "./over-limit";
import type { OverLimitService } from "./over-limit.service";
import { overLimit } from "./over-limit.service";
import {
    PLAN_ENDING_NOTIFICATION_TYPE,
    PLAN_ENDING_SHOWN_DAYS,
    planEndingStage,
} from "./plan-ending";
import { termEndingOf } from "./term-ending";

/**
 * Telling a business, ahead, what a move to a lower plan pauses (#801),
 * and starting the 7-day clock (`over-limit.ts`). The hourly billing sweep
 * runs it after its other notices.
 *
 * Every way a plan moves down reaches a notice that lists what pauses:
 *
 * | How it moves down                                    | Told by                                   | Pauses from                          |
 * | ---------------------------------------------------- | ----------------------------------------- | ------------------------------------ |
 * | A plan given until a date ends (#805)                 | `plan-ending` notice, 30/7/1 days ahead   | the end                              |
 * | A 12-month term not paid for again (DEC-100)          | `term-ending` notice, 30/7/1 days ahead   | the end                              |
 * | Free or a cheaper plan chosen, or cancelled, for the period's end | this, 30/7/1 days ahead       | the period's end                     |
 * | Anything at once: a payment that failed for good, a cancel now, a trial dropped to Free, a limit or add-on taken away | this, within the hour | 7 days after the notice |
 *
 * Whichever notice first lists what pauses writes the grace claim (one per
 * set of limits); nothing pauses until 7 days after it, so a move told
 * less than 7 days ahead pauses later than it moves. The plan itself moves
 * on its date as before: only the pause waits.
 */

type Tx = Prisma.TransactionClient;

/** The once-only claim on each notice this sends (`CustomerNotice.kind`). */
export const MOVE_DOWN_NOTICE_KIND = "MOVE_DOWN_NOTICE";

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 200;

/**
 * Write the grace claim for `limits` once, on the notice's transaction,
 * and say when the business was first told about them.
 */
export async function claimGraceInTx(
    tx: Pick<Tx, "customerNotice">,
    organizationId: string,
    measure: PauseMeasure,
    now: Date,
): Promise<Date> {
    const eventKey = moveDownClaimKey(measure.limits);
    // Dated by the sweep's clock, not the database's: the 7 days count from
    // the `now` the notice was written for, so a check at exactly 7 days on
    // agrees with what the notice said.
    await tx.customerNotice.createMany({
        data: [
            {
                organizationId,
                eventKey,
                kind: MOVE_DOWN_CLAIM_KIND,
                createdAt: now,
            },
        ],
        skipDuplicates: true,
    });
    const row = await tx.customerNotice.findUnique({
        where: { organizationId_eventKey: { organizationId, eventKey } },
        select: { createdAt: true },
    });
    return row?.createdAt ?? now;
}

/**
 * What a notice of a move at `effectiveAt` says pauses, starting the grace
 * clock; null (and no claim) when nothing would pause.
 */
export async function pausesForMoveInTx(
    tx: Pick<Tx, "customerNotice">,
    organizationId: string,
    measure: PauseMeasure | null,
    effectiveAt: Date,
    zone: string,
    now: Date,
): Promise<PausesWords | null> {
    if (!measure || !anythingPauses(measure)) return null;
    const toldAt = await claimGraceInTx(tx, organizationId, measure, now);
    return {
        pausesOn: paperDay(pauseDate(toldAt, effectiveAt).toISOString(), zone),
        lines: pauseLines(summaryOf(measure)),
    };
}

/** The sweep's step. Returns how many businesses were told. */
export async function noticeMoveDowns(
    now: Date,
    logger: Pick<Logger, "error">,
    svc: OverLimitService = overLimit,
    access: CatalogueAccessService = new CatalogueAccessService(),
): Promise<number> {
    await clearStaleClaims(now, logger, svc);
    const chosen = await noticeChosenMoves(now, logger, svc);
    const made = await noticeMovesMade(now, logger, svc, access);
    return chosen + made;
}

/**
 * Grace claims the business has left behind (it moved back up, or is no
 * longer over) go, so the next move down is told and waited for again
 * (`claimStands`).
 */
export async function clearStaleClaims(
    now: Date,
    logger: Pick<Logger, "error">,
    svc: OverLimitService = overLimit,
): Promise<number> {
    const claims = await prisma.customerNotice.findMany({
        where: { kind: MOVE_DOWN_CLAIM_KIND },
        select: {
            id: true,
            organizationId: true,
            eventKey: true,
            createdAt: true,
        },
    });
    const byOrg = new Map<string, typeof claims>();
    for (const c of claims) {
        byOrg.set(c.organizationId, [
            ...(byOrg.get(c.organizationId) ?? []),
            c,
        ]);
    }
    let cleared = 0;
    for (const [organizationId, rows] of byOrg) {
        try {
            const s = await svc.standing(organizationId, now);
            const gone = rows.filter(
                (r) =>
                    !claimStands({
                        eventKey: r.eventKey,
                        toldAt: r.createdAt,
                        current: s?.limits ?? null,
                        over: s?.over ?? false,
                        now,
                    }),
            );
            if (gone.length === 0) continue;
            const out = await prisma.customerNotice.deleteMany({
                where: { id: { in: gone.map((r) => r.id) } },
            });
            cleared += out.count;
            svc.forget(organizationId);
        } catch (error) {
            logger.error(
                `move_down_clear_failed org=${organizationId}: ${String(error)}`,
            );
        }
    }
    return cleared;
}

/**
 * Moves the business chose for its period's end (a cheaper plan, Free, a
 * cancel), told 30, 7 and 1 days ahead when they pause anything. A term's
 * end is told by its own notice (`term-ending-notice.ts`), so it is passed
 * over here.
 */
export async function noticeChosenMoves(
    now: Date,
    logger: Pick<Logger, "error">,
    svc: OverLimitService = overLimit,
): Promise<number> {
    const horizon = new Date(now.getTime() + PLAN_ENDING_SHOWN_DAYS * DAY_MS);
    const subs = await prisma.subscription.findMany({
        where: {
            status: { not: "CANCELLED" },
            pendingFrom: { gt: now, lte: horizon },
        },
        select: {
            id: true,
            organizationId: true,
            pendingFrom: true,
            plan: { select: { name: true } },
            pendingPlan: { select: { name: true } },
        },
    });
    let told = 0;
    for (const sub of subs) {
        try {
            if (!sub.pendingFrom) continue;
            if (await termEndingOf(prisma, sub.id, now)) continue;
            const stage = planEndingStage(sub.pendingFrom, now);
            if (!stage) continue;
            const measure = await svc.previewAt(
                sub.organizationId,
                sub.pendingFrom,
            );
            if (!measure || !anythingPauses(measure)) continue;
            const sent = await tell({
                organizationId: sub.organizationId,
                eventKey: `move-down-notice:${sub.id}:${sub.pendingFrom.toISOString()}:${stage}`,
                measure,
                mode: "scheduled",
                planName: sub.plan.name,
                nextPlanName: sub.pendingPlan?.name ?? null,
                effectiveAt: sub.pendingFrom,
                now,
            });
            if (sent) told += 1;
        } catch (error) {
            logger.error(
                `move_down_notice_failed subscription=${sub.id}: ${String(error)}`,
            );
        }
    }
    return told;
}

/**
 * Moves that already happened, with nothing told: a payment that failed
 * for good, a cancel now, a limit or add-on taken away. Every business
 * the catalogue enforces is read; one over its limits with no grace claim
 * for them is told now, and pauses 7 days on.
 */
export async function noticeMovesMade(
    now: Date,
    logger: Pick<Logger, "error">,
    svc: OverLimitService = overLimit,
    access: CatalogueAccessService = new CatalogueAccessService(),
): Promise<number> {
    let told = 0;
    let after: string | undefined;
    for (;;) {
        const page = await prisma.organization.findMany({
            where: {
                lifecycleStatus: "ACTIVE",
                ...(after ? { id: { gt: after } } : {}),
            },
            select: { id: true },
            orderBy: { id: "asc" },
            take: BATCH,
        });
        for (const { id } of page) {
            try {
                const s = await svc.standing(id, now);
                if (!s?.over || s.toldAt) continue;
                const a = await access.resolve(id, now);
                const sent = await tell({
                    organizationId: id,
                    eventKey: null,
                    measure: s.measure,
                    mode: "now",
                    planName: a.source === "catalogue" ? a.planName : "current",
                    nextPlanName: null,
                    effectiveAt: now,
                    now,
                });
                if (sent) told += 1;
            } catch (error) {
                logger.error(
                    `move_down_notice_failed org=${id}: ${String(error)}`,
                );
            }
        }
        if (page.length < BATCH) break;
        after = page[page.length - 1].id;
    }
    return told;
}

/**
 * One notice, once: the inbox row and the email, on one transaction with
 * the grace claim. `eventKey` null (a move made now): once per grace
 * claim, so a second sweep finds the claim and says nothing.
 */
async function tell(input: {
    organizationId: string;
    eventKey: string | null;
    measure: PauseMeasure;
    mode: "scheduled" | "now";
    planName: string;
    nextPlanName: string | null;
    effectiveAt: Date;
    now: Date;
}): Promise<boolean> {
    const { organizationId, measure, now } = input;
    const zone = await businessTimezone(prisma, organizationId);
    const graceKey = moveDownClaimKey(measure.limits);
    return prisma.$transaction(async (tx) => {
        let eventKey = input.eventKey;
        if (eventKey === null) {
            // Made now: the grace claim is the once-only claim.
            const fresh = await tx.customerNotice.createMany({
                data: [
                    {
                        organizationId,
                        eventKey: graceKey,
                        kind: MOVE_DOWN_CLAIM_KIND,
                        createdAt: now,
                    },
                ],
                skipDuplicates: true,
            });
            if (fresh.count === 0) return false;
            eventKey = `move-down-notice:now:${now.toISOString()}`;
        }
        const claim = await tx.customerNotice.createMany({
            data: [{ organizationId, eventKey, kind: MOVE_DOWN_NOTICE_KIND }],
            skipDuplicates: true,
        });
        if (claim.count === 0) return false;
        const pauses = await pausesForMoveInTx(
            tx,
            organizationId,
            measure,
            input.effectiveAt,
            zone,
            now,
        );
        if (!pauses) return false;
        const said = {
            mode: input.mode,
            planName: input.planName,
            nextPlanName: input.nextPlanName,
            movesOn:
                input.mode === "scheduled"
                    ? paperDay(input.effectiveAt.toISOString(), zone)
                    : null,
            pausesOn: pauses.pausesOn,
            lines: pauses.lines,
        };
        const words = moveDownNotice(said);
        const notice = await tx.notification.create({
            data: {
                organizationId,
                type: PLAN_ENDING_NOTIFICATION_TYPE,
                title: words.title,
                body: words.body,
            },
            select: { id: true },
        });
        await tx.customerNotice.updateMany({
            where: { organizationId, eventKey },
            data: { notificationId: notice.id },
        });
        await enqueueBillingEmail(tx, {
            kind: "MOVE_DOWN",
            organizationId,
            eventKey,
            graceKey,
            ...said,
        });
        return true;
    });
}
