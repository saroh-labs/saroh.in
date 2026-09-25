import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import { RELEASE_HOLDS_TYPE, releaseHoldInTx } from "./booking-hold";

export { RELEASE_HOLDS_TYPE } from "./booking-hold";

/** How often the sweep looks for holds whose time ran out. */
export const RELEASE_EVERY_MS = 5 * 60 * 1000;

/** Holds released per run; past that, the next run starts straight away. */
export const RELEASE_BATCH = 200;

/**
 * Releases pay-now holds nobody paid for (U19): each PENDING booking whose
 * hold ran out is cancelled and its draft invoice voided (`releaseHoldInTx`).
 *
 * Reads never wait for this — a hold past its time already holds nothing
 * (`holdsPlace`) — so the sweep only writes down what is already true, and a
 * slow run costs nothing but a tidy calendar. It reschedules itself like the
 * renewal job (ADR-007): one PENDING run at a time (a partial unique index),
 * a failing hold logged and left for the next run, and a throw only when the
 * next run cannot be enqueued.
 */
@Injectable()
export class ReleaseHoldsHandler {
    private readonly logger = new Logger(ReleaseHoldsHandler.name);

    readonly handle = async (_job: Job): Promise<void> => {
        let full = false;
        try {
            full = await this.releaseExpired(new Date());
        } catch (error) {
            this.logger.error(
                `Hold release run failed before it finished: ${String(error)}`,
            );
        }
        const next = new Date(Date.now() + (full ? 0 : RELEASE_EVERY_MS));
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next hold release run; retrying this one",
            );
        }
    };

    /**
     * Release one batch of holds that ran out by `now`. True when the batch
     * was full, so there may be more.
     */
    async releaseExpired(now: Date): Promise<boolean> {
        const due = await prisma.booking.findMany({
            where: { status: "PENDING", holdExpiresAt: { lte: now } },
            orderBy: { holdExpiresAt: "asc" },
            take: RELEASE_BATCH,
            select: { id: true },
        });
        let released = 0;
        for (const { id } of due) {
            try {
                // Re-read under the booking's lock inside: a payment that
                // confirmed it a moment ago wins, and nothing is released.
                if (
                    await prisma.$transaction((tx) =>
                        releaseHoldInTx(tx, id, now),
                    )
                ) {
                    released += 1;
                }
            } catch (error) {
                this.logger.error(
                    `Could not release hold ${id}: ${String(error)}`,
                );
            }
        }
        if (released > 0) {
            this.logger.log(`Released ${released} unpaid booking holds`);
        }
        return due.length === RELEASE_BATCH;
    }

    /**
     * Enqueue the next run unless one is already waiting: a create that
     * expects to lose to the partial unique index (P2002 = already
     * scheduled). Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: { type: RELEASE_HOLDS_TYPE, payload: {}, runAt },
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
                `Could not schedule the next hold release run: ${String(error)}`,
            );
            return false;
        }
    }

    /** Start the chain again when nothing is waiting or running. */
    async ensureScheduled(): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: RELEASE_HOLDS_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(new Date());
        } catch (error) {
            this.logger.error(
                `Could not check the hold release chain: ${String(error)}`,
            );
        }
    }
}
