import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import { PaymentLookupService } from "./payment-lookup.service";

/** The self-rescheduling job that asks providers about open intents (P1). */
export const CONFIRM_PENDING_PAYMENTS_TYPE = "payments.confirm-pending";

/** How often the sweep runs. Which intents it asks about is the schedule's. */
export const CONFIRM_PENDING_EVERY_MS = 60_000;

/**
 * The pending payment sweep (P1): each run asks the provider about the
 * open intents due an ask (`PaymentLookupService.sweep`) and settles a
 * capture whose webhook never came, through the webhook's own path.
 *
 * It reschedules itself like the hold release (ADR-007): one PENDING run
 * at a time (a partial unique index), a failing intent logged and left for
 * its next turn, a full batch followed at once by the next run, and a
 * throw only when the next run cannot be enqueued.
 */
@Injectable()
export class PendingPaymentsHandler {
    private readonly logger = new Logger(PendingPaymentsHandler.name);

    constructor(private readonly lookup: PaymentLookupService) {}

    readonly handle = async (_job: Job): Promise<void> => {
        let full = false;
        try {
            full = (await this.lookup.sweep(new Date())).full;
        } catch (error) {
            this.logger.error(
                `Pending payment sweep failed before it finished: ${String(error)}`,
            );
        }
        const next = new Date(
            Date.now() + (full ? 0 : CONFIRM_PENDING_EVERY_MS),
        );
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next pending payment sweep; retrying this one",
            );
        }
    };

    /**
     * Enqueue the next run unless one is already waiting (P2002 = already
     * scheduled). Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: {
                    type: CONFIRM_PENDING_PAYMENTS_TYPE,
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
                `Could not schedule the next pending payment sweep: ${String(error)}`,
            );
            return false;
        }
    }

    /** Start the chain again when nothing is waiting or running. */
    async ensureScheduled(): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: CONFIRM_PENDING_PAYMENTS_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(new Date());
        } catch (error) {
            this.logger.error(
                `Could not check the pending payment sweep chain: ${String(error)}`,
            );
        }
    }
}
