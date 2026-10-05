import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { prismaErrorCode } from "../../common/prisma-errors";
import { LINK_PREVIEW_SOURCE } from "./waitlist-keys";

/** The self-rescheduling job that deletes old waitlist entries (U30, KTD-17). */
export const WAITLIST_RETENTION_TYPE = "waitlist.retention";

/** Once a day is plenty: the rule is counted in months. */
export const WAITLIST_RETENTION_EVERY_MS = 24 * 60 * 60 * 1000;

/** How long an invited entry that never joined is kept. */
export const WAITLIST_KEEP_DAYS = 365;

const BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The waitlist's retention rule (plan KTD-17): an entry is deleted 12 months
 * after its invite (the invites go out at launch) unless the person joined.
 * Entries never invited are kept — they are still waiting. Asking to be
 * removed is a separate, immediate path in the console.
 *
 * It reschedules itself like the pending payment sweep (ADR-007): one
 * PENDING run at a time (a partial unique index), and a throw only when the
 * next run cannot be enqueued.
 */
@Injectable()
export class WaitlistRetentionHandler {
    private readonly logger = new Logger(WaitlistRetentionHandler.name);

    readonly handle = async (_job: Job): Promise<void> => {
        try {
            const deleted = await this.sweep(new Date());
            if (deleted > 0) {
                this.logger.log(
                    `waitlist: retention deleted ${deleted} entries`,
                );
            }
        } catch (error) {
            this.logger.error(
                `Waitlist retention sweep failed before it finished: ${String(error)}`,
            );
        }
        const next = new Date(Date.now() + WAITLIST_RETENTION_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next waitlist retention sweep; retrying this one",
            );
        }
    };

    /** Delete what the rule says is past keeping. Returns how many went. */
    async sweep(now: Date): Promise<number> {
        const cutoff = new Date(now.getTime() - WAITLIST_KEEP_DAYS * DAY_MS);
        return (
            (await this.sweepLinkReports(cutoff)) +
            (await this.sweepInvited(cutoff))
        );
    }

    /**
     * The link preview tool's rule (Privacy: "a link-preview report: with
     * the email it was sent to, 12 months"): an entry that only ever asked
     * for a report goes 12 months after its last check, and any other entry
     * forgets the link it checked then. Counts only deleted entries.
     */
    private async sweepLinkReports(cutoff: Date): Promise<number> {
        const { count } = await prisma.waitlistSignup.deleteMany({
            where: {
                source: LINK_PREVIEW_SOURCE,
                checkedAt: { lt: cutoff },
                invitedAt: null,
                joinedAt: null,
            },
        });
        await prisma.waitlistSignup.updateMany({
            where: { checkedAt: { lt: cutoff } },
            data: { checkedUrl: null, checkedAt: null },
        });
        return count;
    }

    private async sweepInvited(cutoff: Date): Promise<number> {
        let total = 0;
        for (;;) {
            const due = await prisma.waitlistSignup.findMany({
                where: { invitedAt: { lt: cutoff }, joinedAt: null },
                select: { id: true },
                take: BATCH,
            });
            if (due.length === 0) return total;
            const { count } = await prisma.waitlistSignup.deleteMany({
                where: {
                    id: { in: due.map((row) => row.id) },
                    invitedAt: { lt: cutoff },
                    joinedAt: null,
                },
            });
            total += count;
            // A batch that deleted nothing (someone joined in between) would
            // otherwise be fetched again for ever.
            if (count === 0 || due.length < BATCH) return total;
        }
    }

    /**
     * Enqueue the next run unless one is already waiting (P2002 = already
     * scheduled). Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.job.create({
                data: { type: WAITLIST_RETENTION_TYPE, payload: {}, runAt },
            });
            return true;
        } catch (error) {
            if (prismaErrorCode(error) === "P2002") return true;
            this.logger.error(
                `Could not schedule the next waitlist retention sweep: ${String(error)}`,
            );
            return false;
        }
    }

    /** Start the chain again when nothing is waiting or running. */
    async ensureScheduled(): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: WAITLIST_RETENTION_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(new Date());
        } catch (error) {
            this.logger.error(
                `Could not check the waitlist retention chain: ${String(error)}`,
            );
        }
    }
}
