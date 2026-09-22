import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import { PAYMENTS_SWITCHED_OFF } from "../invoices/payments-on";
import { SUBSCRIPTION_RENEW_TYPE } from "./renew-job";
import { SubscriptionsService } from "./subscriptions.service";

export { SUBSCRIPTION_RENEW_TYPE } from "./renew-job";

/** How often the job looks for subscriptions that are due. */
export const RENEW_EVERY_MS = 60 * 60 * 1000;

/** Subscriptions renewed per run; a full batch runs again straight away. */
export const RENEW_BATCH = 200;

/**
 * Issues each subscription period's invoice on its renewal date (ADR-007).
 *
 * There is no scheduler, so the job reschedules itself: every run ends by
 * enqueueing the next, and module start-up does the same. A partial unique
 * index allows one PENDING run of this type, so a duplicate enqueue — a boot
 * racing a run, two instances starting — collapses into the one that is
 * already waiting, and the chain never forks.
 *
 * The handler never throws. A subscription that fails to renew is logged and
 * tried again on the next run; if the handler threw, the worker would retry
 * and then dead-letter the job, and the chain would stop.
 *
 * Businesses with Payments switched off are skipped until it is back on:
 * disabling a module stops new activity (ADR-003).
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
        await this.schedule(new Date(Date.now() + (full ? 0 : RENEW_EVERY_MS)));
    };

    /** Renew what is due now. True when the batch was full and more may wait. */
    async renewDue(now: Date): Promise<boolean> {
        const due = await prisma.customerSubscription.findMany({
            where: {
                status: "ACTIVE",
                currentPeriodEnd: { lte: now },
                organization: {
                    organizationModules: { none: PAYMENTS_SWITCHED_OFF },
                },
            },
            orderBy: { currentPeriodEnd: "asc" },
            take: RENEW_BATCH,
            select: { id: true, organizationId: true },
        });

        const counts = {
            renewed: 0,
            advanced: 0,
            ended: 0,
            skipped: 0,
            failed: 0,
        };
        for (const sub of due) {
            try {
                counts[await this.subscriptions.renewOne(sub.id, now)] += 1;
            } catch (error) {
                counts.failed += 1;
                this.logger.error(
                    `Subscription ${sub.id} (organization ${sub.organizationId}) did not renew: ${String(error)}`,
                );
            }
        }
        if (due.length > 0) {
            this.logger.log(`Subscription renewals: ${JSON.stringify(counts)}`);
        }
        return due.length === RENEW_BATCH;
    }

    /**
     * Enqueue the next run unless one is already waiting. Written as a create
     * that expects to lose: the partial unique index refuses a second PENDING
     * row, and that refusal (P2002) is the "already scheduled" answer.
     */
    async schedule(runAt: Date): Promise<void> {
        try {
            await prisma.job.create({
                data: {
                    type: SUBSCRIPTION_RENEW_TYPE,
                    payload: {},
                    runAt,
                },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === "P2002"
            ) {
                return;
            }
            this.logger.error(
                `Could not schedule the next subscription renewal run: ${String(error)}`,
            );
        }
    }
}
