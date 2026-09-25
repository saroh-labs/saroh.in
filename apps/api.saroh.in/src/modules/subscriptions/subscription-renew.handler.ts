import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import { PAYMENTS_SWITCHED_OFF } from "../invoices/payments-on";
import { SUBSCRIPTION_RENEW_TYPE } from "./renew-job";
import { SubscriptionsService } from "./subscriptions.service";

export { SUBSCRIPTION_RENEW_TYPE } from "./renew-job";

/** How often the job looks for subscriptions that are due. */
export const RENEW_EVERY_MS = 60 * 60 * 1000;

/** Subscriptions fetched at a time. */
export const RENEW_BATCH = 200;

/** Batches per run; past that, the next run starts straight away. */
export const RENEW_ROUNDS = 25;

/**
 * Issues each subscription period's invoice on its renewal date (ADR-007).
 *
 * There is no scheduler, so the job reschedules itself: every run ends by
 * enqueueing the next, and module start-up does the same. A partial unique
 * index allows one PENDING run of this type, so a duplicate enqueue — a boot
 * racing a run, two instances starting — collapses into the one that is
 * already waiting, and the chain never forks.
 *
 * A subscription that fails to renew is logged and tried again on the next
 * run — that never makes the handler throw, since retrying and then
 * dead-lettering the run would stop the chain. The one thing it throws for is
 * failing to enqueue the next run: then this run is retried with backoff, as
 * the pending one, which keeps the chain alive through a database blip.
 * `ensureScheduled`, on a timer, starts it again if even that runs out.
 *
 * Businesses with Payments switched off are skipped until it is back on —
 * disabling a module stops new activity (ADR-003) — except that a
 * subscription set to end still ends, paused or not.
 */
@Injectable()
export class SubscriptionRenewHandler {
    private readonly logger = new Logger(SubscriptionRenewHandler.name);

    constructor(private readonly subscriptions: SubscriptionsService) {}

    readonly handle = async (_job: Job): Promise<void> => {
        let full = false;
        try {
            full = await this.renewDue(new Date());
        } catch (error) {
            this.logger.error(
                `Renewal run failed before it finished: ${String(error)}`,
            );
        }
        const next = new Date(Date.now() + (full ? 0 : RENEW_EVERY_MS));
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next subscription renewal run; retrying this one",
            );
        }
    };

    /**
     * Renew what is due now, batch after batch. True when it stopped with
     * more still waiting, so the next run starts straight away.
     *
     * A subscription is looked at once per run: one that fails is left for
     * the next run rather than fetched again. Without that, a batch's worth
     * that always fail would sit at the head of every query, ahead of
     * everyone else's renewals, and the run would never get past them.
     */
    async renewDue(now: Date): Promise<boolean> {
        const seen: string[] = [];
        const counts = {
            renewed: 0,
            advanced: 0,
            uncharged: 0,
            ended: 0,
            skipped: 0,
            failed: 0,
        };
        let more = true;
        for (let round = 0; round < RENEW_ROUNDS && more; round += 1) {
            const due = await prisma.customerSubscription.findMany({
                where: {
                    currentPeriodEnd: { lte: now },
                    ...(seen.length > 0 ? { id: { notIn: [...seen] } } : {}),
                    OR: [
                        {
                            status: "ACTIVE",
                            organization: {
                                organizationModules: {
                                    none: PAYMENTS_SWITCHED_OFF,
                                },
                            },
                        },
                        // Ending bills nothing, so it goes ahead with Payments
                        // off, and for a paused one set to end.
                        {
                            status: { in: ["ACTIVE", "PAUSED"] },
                            cancelAtPeriodEnd: true,
                        },
                    ],
                },
                orderBy: { currentPeriodEnd: "asc" },
                take: RENEW_BATCH,
                select: { id: true, organizationId: true },
            });
            for (const sub of due) {
                seen.push(sub.id);
                try {
                    counts[await this.subscriptions.renewOne(sub.id, now)] += 1;
                } catch (error) {
                    counts.failed += 1;
                    this.logger.error(
                        `Subscription ${sub.id} (organization ${sub.organizationId}) did not renew: ${String(error)}`,
                    );
                }
            }
            more = due.length === RENEW_BATCH;
        }
        if (seen.length > 0) {
            this.logger.log(`Subscription renewals: ${JSON.stringify(counts)}`);
        }
        return more;
    }

    /**
     * Enqueue the next run unless one is already waiting. Written as a create
     * that expects to lose: the partial unique index refuses a second PENDING
     * row, and that refusal (P2002) is the "already scheduled" answer.
     * Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: {
                    type: SUBSCRIPTION_RENEW_TYPE,
                    payload: {},
                    runAt,
                },
            });
            return true;
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                return true;
            }
            this.logger.error(
                `Could not schedule the next subscription renewal run: ${String(error)}`,
            );
            return false;
        }
    }

    /**
     * The safety net: when no run is waiting or in progress — the chain was
     * dead-lettered, or never started because the database was down at boot —
     * enqueue one now. Never throws.
     */
    async ensureScheduled(): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: SUBSCRIPTION_RENEW_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            this.logger.warn(
                "No subscription renewal run was waiting; starting the chain again",
            );
            await this.schedule(new Date());
        } catch (error) {
            this.logger.error(
                `Could not check the subscription renewal chain: ${String(error)}`,
            );
        }
    }
}
