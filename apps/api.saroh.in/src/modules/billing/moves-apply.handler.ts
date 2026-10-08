import { Injectable, Logger, Optional } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { businessTimezone } from "../bookings/staff-availability";
import { paperDay } from "../invoices/invoice-paper-view";
import { enqueueBillingEmail } from "./billing-email.job";
import { planEndingNotice } from "./billing-emails";
import { isOneTime } from "./billing-term";
import { CatalogueAccessService } from "./catalogue-access.service";
import {
    PLAN_ENDING_NOTICE_KIND,
    PLAN_ENDING_NOTIFICATION_TYPE,
    PLAN_ENDING_SHOWN_DAYS,
    planEndingEventKey,
    planEndingStage,
} from "./plan-ending";
import { applyDueMoveInTx } from "./plan-moves";
import { enqueueProviderCancel } from "./provider-cancel.job";
import { endTermAtInTx } from "./term-end";
import { remindEndingTerms } from "./term-ending-notice";

/**
 * Saroh billing's hourly sweep (pricing catalogue U15), a self-rescheduling
 * job like the renewal chain (ADR-007): one PENDING run at a time (a partial
 * unique index), a throw only when the next run can't be enqueued.
 *
 * 1. **Due moves.** Applies every pending move whose date has passed and
 *    that is ready (`plan-moves.ts`). A paid subscription's move is applied
 *    by its renewal webhook as it charges; this reaches the rest — Free
 *    plans, which bill nothing, and any webhook that never came.
 * 2. **Lapsed checkouts.** An OPEN checkout past `expiresAt` was never
 *    authorised: CANCELLED, and its provider subscription cancelled.
 * 0. **Years that ended** (DEC-093), first: a yearly plan is one payment,
 *    so no provider event marks the end of its year. One that ended with
 *    nothing renewed is put on course for Free from its end
 *    (`term-end.ts`), and step 1 applies it.
 * 3. **Plans that end** (#805). A plan override with an end date that moves
 *    the business to a cheaper plan is told 30, 7 and 1 days ahead
 *    (`plan-ending.ts`): an inbox notice and an email to its billing
 *    people, each claimed once as a `CustomerNotice`.
 * 4. **Terms that end** (DEC-100). A 12-month term in its last 30 days is
 *    asked to pay for the next term, 30, 7 and 1 days ahead, the same way
 *    (`term-ending.ts`, `term-ending-notice.ts`).
 */
export const BILLING_MOVES_APPLY_TYPE = "billing.moves.apply";

export const BILLING_SWEEP_EVERY_MS = 60 * 60 * 1000;

const BATCH = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SweepOutcome {
    applied: number;
    waiting: number;
    lapsed: number;
    reminded: number;
}

@Injectable()
export class MovesApplyHandler {
    private readonly logger = new Logger(MovesApplyHandler.name);

    constructor(
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
    ) {}

    readonly handle = async (_job: Job): Promise<void> => {
        try {
            const out = await this.sweep(new Date());
            if (out.applied || out.lapsed || out.reminded) {
                this.logger.log(
                    `billing_sweep applied=${out.applied} waiting=${out.waiting} lapsed=${out.lapsed} reminded=${out.reminded}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `Billing sweep failed before it finished: ${String(error)}`,
            );
        }
        const next = new Date(Date.now() + BILLING_SWEEP_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next billing sweep; retrying this one",
            );
        }
    };

    async sweep(now: Date): Promise<SweepOutcome> {
        const out: SweepOutcome = {
            applied: 0,
            waiting: 0,
            lapsed: 0,
            reminded: 0,
        };
        await this.endPaidYears(now);
        const tried = new Set<string>();
        for (;;) {
            const due = await prisma.subscription.findMany({
                where: {
                    pendingFrom: { lte: now },
                    ...(tried.size ? { id: { notIn: [...tried] } } : {}),
                },
                select: { id: true },
                orderBy: { pendingFrom: "asc" },
                take: BATCH,
            });
            if (due.length === 0) break;
            for (const { id } of due) {
                tried.add(id);
                try {
                    const r = await prisma.$transaction((tx) =>
                        applyDueMoveInTx(tx, id, now),
                    );
                    if (r.applied) out.applied += 1;
                    else out.waiting += 1;
                } catch (error) {
                    // One that fails never stops the rest.
                    this.logger.error(
                        `billing_move_apply_failed subscription=${id}: ${String(error)}`,
                    );
                }
            }
            if (due.length < BATCH) break;
        }
        out.lapsed = await this.lapseCheckouts(now);
        out.reminded = await this.remindEndingPlans(now);
        out.reminded += await remindEndingTerms(now, this.logger);
        return out;
    }

    /**
     * Yearly plans paid once whose year is over with nothing waiting: on
     * course for Free from the year's end. An autopay subscription is left
     * to its provider's events (a late `charged` must never read as an
     * end). Returns how many were set.
     */
    async endPaidYears(now: Date): Promise<number> {
        const ended = await prisma.subscription.findMany({
            where: {
                status: { not: "CANCELLED" },
                provider: { not: null },
                providerSubscriptionId: { not: null },
                pendingFrom: null,
                currentPeriodEnd: { lte: now },
            },
            select: {
                id: true,
                provider: true,
                providerSubscriptionId: true,
            },
            take: BATCH,
        });
        let set = 0;
        for (const s of ended) {
            if (!s.provider || !s.providerSubscriptionId) continue;
            const checkout = await prisma.billingCheckout.findUnique({
                where: {
                    provider_providerSubscriptionId: {
                        provider: s.provider,
                        providerSubscriptionId: s.providerSubscriptionId,
                    },
                },
                select: { providerPlanId: true },
            });
            if (!checkout || !isOneTime(checkout)) continue;
            try {
                const done = await prisma.$transaction(async (tx) => {
                    await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "id" = ${s.id} FOR UPDATE`;
                    const sub = await tx.subscription.findUnique({
                        where: { id: s.id },
                        select: {
                            id: true,
                            pendingFrom: true,
                            currentPeriodEnd: true,
                            providerSubscriptionId: true,
                            plan: { select: { version: true } },
                        },
                    });
                    if (
                        !sub?.currentPeriodEnd ||
                        sub.currentPeriodEnd > now ||
                        sub.providerSubscriptionId !== s.providerSubscriptionId
                    ) {
                        return false;
                    }
                    return endTermAtInTx(tx, sub, sub.currentPeriodEnd);
                });
                if (done) set += 1;
            } catch (error) {
                this.logger.error(
                    `billing_year_end_failed subscription=${s.id}: ${String(error)}`,
                );
            }
        }
        return set;
    }

    /**
     * Every business on a plan override that ends within 30 days, told the
     * notice that is due (`planEndingStage`), once. What it is on and what
     * follows are read by `CatalogueAccessService.planEnding`, so an end
     * that costs it nothing, or an override that isn't the one it reads, is
     * passed over.
     */
    async remindEndingPlans(now: Date): Promise<number> {
        const horizon = new Date(
            now.getTime() + PLAN_ENDING_SHOWN_DAYS * DAY_MS,
        );
        let reminded = 0;
        let after: string | undefined;
        for (;;) {
            const page = await prisma.entitlementOverride.findMany({
                where: {
                    kind: "plan",
                    revokedAt: null,
                    expiresAt: { gt: now, lte: horizon },
                    ...(after ? { organizationId: { gt: after } } : {}),
                },
                select: { organizationId: true },
                distinct: ["organizationId"],
                orderBy: { organizationId: "asc" },
                take: BATCH,
            });
            for (const { organizationId } of page) {
                try {
                    if (await this.remindOne(organizationId, now))
                        reminded += 1;
                } catch (error) {
                    // One that fails never stops the rest.
                    this.logger.error(
                        `plan_ending_notice_failed org=${organizationId}: ${String(error)}`,
                    );
                }
            }
            if (page.length < BATCH) break;
            after = page[page.length - 1].organizationId;
        }
        return reminded;
    }

    private async remindOne(
        organizationId: string,
        now: Date,
    ): Promise<boolean> {
        const ending = await this.access.planEnding(organizationId, now);
        if (!ending) return false;
        const stage = planEndingStage(ending.endsAt, now);
        if (!stage) return false;
        const eventKey = planEndingEventKey(
            ending.overrideId,
            ending.endsAt,
            stage,
        );
        const zone = await businessTimezone(prisma, organizationId);
        const endsOn = paperDay(ending.endsAt.toISOString(), zone);
        const words = planEndingNotice({
            planName: ending.planName,
            nextPlanName: ending.nextPlanName,
            endsOn,
        });
        return prisma.$transaction(async (tx) => {
            const claim = await tx.customerNotice.createMany({
                data: [
                    {
                        organizationId,
                        eventKey,
                        kind: PLAN_ENDING_NOTICE_KIND,
                    },
                ],
                skipDuplicates: true,
            });
            if (claim.count === 0) return false;
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
                kind: "PLAN_ENDING",
                organizationId,
                overrideId: ending.overrideId,
                endsAt: ending.endsAt.toISOString(),
                stage,
                planName: ending.planName,
                nextPlanName: ending.nextPlanName,
                endsOn,
            });
            return true;
        });
    }

    /** OPEN checkouts nobody authorised in time. */
    async lapseCheckouts(now: Date): Promise<number> {
        const stale = await prisma.billingCheckout.findMany({
            where: { status: "OPEN", expiresAt: { lte: now } },
            select: { id: true },
            take: BATCH,
        });
        let lapsed = 0;
        for (const { id } of stale) {
            await prisma.$transaction(async (tx) => {
                const gone = await tx.billingCheckout.updateMany({
                    where: { id, status: "OPEN" },
                    data: { status: "CANCELLED", endedReason: "expired" },
                });
                if (gone.count === 0) return;
                const row = await tx.billingCheckout.findUniqueOrThrow({
                    where: { id },
                });
                await enqueueProviderCancel(tx, {
                    organizationId: row.organizationId,
                    provider: row.provider,
                    providerSubscriptionId: row.providerSubscriptionId,
                    atCycleEnd: false,
                });
                lapsed += 1;
            });
        }
        return lapsed;
    }

    /** Enqueue the next run unless one is waiting (P2002). Never throws. */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: { type: BILLING_MOVES_APPLY_TYPE, payload: {}, runAt },
            });
            return true;
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return true;
            this.logger.error(
                `Could not schedule the next billing sweep: ${String(error)}`,
            );
            return false;
        }
    }

    /** Start the chain again when nothing is waiting or running. */
    async ensureScheduled(): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: BILLING_MOVES_APPLY_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(new Date());
        } catch (error) {
            this.logger.error(
                `Could not check the billing sweep chain: ${String(error)}`,
            );
        }
    }
}
