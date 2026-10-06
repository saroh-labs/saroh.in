import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { applyDueMoveInTx } from "./plan-moves";
import { enqueueProviderCancel } from "./provider-cancel.job";

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
 */
export const BILLING_MOVES_APPLY_TYPE = "billing.moves.apply";

export const BILLING_SWEEP_EVERY_MS = 60 * 60 * 1000;

const BATCH = 200;

export interface SweepOutcome {
    applied: number;
    waiting: number;
    lapsed: number;
}

@Injectable()
export class MovesApplyHandler {
    private readonly logger = new Logger(MovesApplyHandler.name);

    readonly handle = async (_job: Job): Promise<void> => {
        try {
            const out = await this.sweep(new Date());
            if (out.applied || out.lapsed) {
                this.logger.log(
                    `billing_sweep applied=${out.applied} waiting=${out.waiting} lapsed=${out.lapsed}`,
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
        const out: SweepOutcome = { applied: 0, waiting: 0, lapsed: 0 };
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
        return out;
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
