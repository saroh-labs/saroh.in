import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { Prisma, prisma } from "@saroh/database";

import { discardStalePackDrafts } from "../class-packs/pack-checkout";
import { discardStalePlanJoins } from "../subscriptions/plan-join";
import { PaymentLookupService } from "../webhooks/payment-lookup.service";
import { RELEASE_HOLDS_TYPE, releaseHoldInTx } from "./booking-hold";
import { deleteOldEntries, expireLapsedOffers } from "./waitlist-offer";

export { RELEASE_HOLDS_TYPE } from "./booking-hold";

/** How often the sweep looks for holds whose time ran out. */
export const RELEASE_EVERY_MS = 5 * 60 * 1000;

/** Holds released per run; past that, the next run starts straight away. */
export const RELEASE_BATCH = 200;

/**
 * How long a hold whose provider could not say whether it was paid is kept
 * past its time, asked about again each run, before it is released anyway
 * (P1). A hold past its time already holds nothing, so keeping it costs
 * nothing; a payment that settles it later still confirms it when the
 * place is free (`confirmHoldInTx`).
 */
export const UNANSWERED_HOLD_GRACE_MS = 60 * 60 * 1000;

/**
 * Releases pay-now holds nobody paid for (U19): each PENDING booking whose
 * hold ran out is cancelled and its draft invoice voided (`releaseHoldInTx`).
 * Each run also voids the online pack drafts nobody paid within 24 hours
 * (A11, `class-packs/pack-checkout.ts`) and the online plan joins nobody
 * paid (G20, `subscriptions/plan-join.ts`), ends waitlist offers nobody
 * answered in time — offering each place to the next in line — and deletes
 * places in line closed 30 days ago (A12, `waitlist-offer.ts`).
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

    /**
     * @param payments asks the provider about a hold's payment before the
     *   hold is released (P1). Nest always gives it; only a test that builds
     *   the handler by hand leaves it out, and then a hold is released on
     *   its time alone, as before.
     */
    constructor(private readonly payments?: PaymentLookupService) {}

    readonly handle = async (_job: Job): Promise<void> => {
        let full = false;
        try {
            full = await this.releaseExpired(new Date());
        } catch (error) {
            this.logger.error(
                `Hold release run failed before it finished: ${String(error)}`,
            );
        }
        await this.discardPackDrafts(new Date());
        await this.discardPlanJoins(new Date());
        await this.tidyWaitlist(new Date());
        const next = new Date(Date.now() + (full ? 0 : RELEASE_EVERY_MS));
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next hold release run; retrying this one",
            );
        }
    };

    /**
     * The same tidy-up for packs bought online (A11): drafts nobody paid
     * within 24 hours are voided (`discardStalePackDrafts`). Never throws;
     * a failed run is logged and the next one tries again.
     */
    async discardPackDrafts(now: Date): Promise<number> {
        try {
            const discarded = await discardStalePackDrafts(now);
            if (discarded > 0) {
                this.logger.log(`Discarded ${discarded} unpaid pack drafts`);
            }
            return discarded;
        } catch (error) {
            this.logger.error(
                `Could not discard unpaid pack drafts: ${String(error)}`,
            );
            return 0;
        }
    }

    /**
     * The same for plans joined online (G20): joins nobody paid within 24
     * hours are voided (`discardStalePlanJoins`), so nobody is put on a
     * plan. Never throws; a failed run is logged and the next one tries
     * again.
     */
    async discardPlanJoins(now: Date): Promise<number> {
        try {
            const discarded = await discardStalePlanJoins(now);
            if (discarded > 0) {
                this.logger.log(`Discarded ${discarded} unpaid plan joins`);
            }
            return discarded;
        } catch (error) {
            this.logger.error(
                `Could not discard unpaid plan joins: ${String(error)}`,
            );
            return 0;
        }
    }

    /**
     * The class waitlist's part (A12): offers whose time ran out are ended
     * and their places offered on (`expireLapsedOffers`; an offer's own
     * delayed job normally gets there first), and places in line closed 30
     * days ago are deleted (default 74). Never throws; a failed run is
     * logged and the next one tries again.
     */
    async tidyWaitlist(now: Date): Promise<void> {
        try {
            const ended = await expireLapsedOffers(now);
            if (ended > 0) {
                this.logger.log(`Ended ${ended} unanswered waitlist offers`);
            }
            await deleteOldEntries(now);
        } catch (error) {
            this.logger.error(
                `Could not tidy the class waitlists: ${String(error)}`,
            );
        }
    }

    /**
     * Release one batch of holds that ran out by `now`. True when the batch
     * was full, so there may be more.
     *
     * Each hold's payment is asked about first (P1): money the provider has
     * but whose webhook never came settles the hold through the webhook's
     * own path — confirmed when its place is still free, owed back when not
     * — so a paid hold is never released as unpaid. A provider that can't
     * say keeps the hold for the next run, up to
     * {@link UNANSWERED_HOLD_GRACE_MS} past its time.
     */
    async releaseExpired(now: Date): Promise<boolean> {
        const due = await prisma.booking.findMany({
            where: { status: "PENDING", holdExpiresAt: { lte: now } },
            orderBy: { holdExpiresAt: "asc" },
            take: RELEASE_BATCH,
            select: { id: true, holdExpiresAt: true },
        });
        let released = 0;
        for (const { id, holdExpiresAt } of due) {
            try {
                const paid = await this.payments?.confirmHoldPayment(id);
                // Settled: the payment confirmed it, or released it and
                // recorded the money as owed back. Either way, done.
                if (paid === "PAID") continue;
                if (
                    paid === "UNKNOWN" &&
                    holdExpiresAt &&
                    now.getTime() - holdExpiresAt.getTime() <
                        UNANSWERED_HOLD_GRACE_MS
                ) {
                    continue;
                }
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
