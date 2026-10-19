import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { AdminRole } from "./admin-permissions";
import {
    activeManagerWhere,
    endManagerLinksInTx,
    MANAGER_LINK_SWEEP_ACTOR,
    roleEnded,
} from "./manager-links";

/** The hourly job that ends links whose manager no longer holds the role. */
export const MANAGER_LINK_SWEEP_TYPE = "account-managers.link-sweep";

/**
 * Hourly: a role runs out at its own minute, and commission (U21) pays the
 * manager a business has when a payment clears, so a stale link is short.
 */
export const MANAGER_LINK_SWEEP_EVERY_MS = 60 * 60 * 1000;

/** Managers whose links end per run; the next run takes the rest. */
export const MANAGER_LINK_SWEEP_BATCH = 200;

/** The key that lets one waiting run of the chain exist at a time. */
const CHAIN_LOCK = `job-chain:${MANAGER_LINK_SWEEP_TYPE}`;

/**
 * Ends account-manager links whose manager no longer holds the Account
 * manager role (DEC-169, R34, admin console U25): their assignment ran out,
 * or a revoke or an amend that should have ended them at once didn't
 * (`AdminStaffService` ends them in its own transaction; this is the net).
 *
 * Each link ends at the moment the role ended, not when the sweep noticed
 * (`roleEnded`), so the history, and the commission that reads it, are
 * true to the minute. `endedByUserId` stays empty and the ledger names the
 * sweep (`system:manager-link-sweep`), one row per business, so each
 * business's History says its manager's link ended and why. The business
 * then shows as having no manager until staff give it one.
 *
 * It reschedules itself (ADR-007). One waiting run at a time is kept by a
 * transaction advisory lock on `job-chain:account-managers.link-sweep`
 * around "is one waiting? if not, add one", rather than a partial unique
 * index on `Job`, which would need a migration (`backend-jobs.md`). A
 * failed sweep is logged and the chain goes on; it throws only when the
 * next run cannot be enqueued, so the worker retries it.
 */
@Injectable()
export class ManagerLinkSweepJob {
    private readonly logger = new Logger(ManagerLinkSweepJob.name);

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const swept = await this.sweep(now);
            if (swept.ended > 0) {
                this.logger.log(
                    `manager_link_sweep ended=${swept.ended} managers=${swept.managers}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `manager_link_sweep failed before it finished: ${errorName(error)}`,
            );
        }
        const next = new Date(now.getTime() + MANAGER_LINK_SWEEP_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next manager link sweep; retrying this one",
            );
        }
    };

    /**
     * End every open link whose manager doesn't hold the role at `now`.
     * A manager whose links fail to end is logged and the rest go on.
     */
    async sweep(now: Date): Promise<{ ended: number; managers: number }> {
        // Only managers who don't hold the role now: those holding it are
        // read once, and are few.
        const holding = await prisma.platformAdmin.findMany({
            where: activeManagerWhere(now),
            select: { id: true },
        });
        const open = await prisma.accountManagerLink.findMany({
            where: {
                endedAt: null,
                platformAdminId: { notIn: holding.map((a) => a.id) },
            },
            select: { platformAdminId: true },
            distinct: ["platformAdminId"],
            orderBy: { platformAdminId: "asc" },
            take: MANAGER_LINK_SWEEP_BATCH,
        });
        let ended = 0;
        let managers = 0;
        for (const { platformAdminId } of open) {
            try {
                const count = await prisma.$transaction(async (tx) => {
                    const admin = await tx.platformAdmin.findUnique({
                        where: { id: platformAdminId },
                        select: {
                            revokedAt: true,
                            roleAssignments: {
                                where: { role: AdminRole.AccountManager },
                                select: { revokedAt: true, expiresAt: true },
                            },
                        },
                    });
                    const end = roleEnded(
                        admin
                            ? {
                                  grantRevokedAt: admin.revokedAt,
                                  assignments: admin.roleAssignments,
                              }
                            : null,
                        now,
                    );
                    if (!end) return 0;
                    const links = await endManagerLinksInTx(tx, {
                        platformAdminId,
                        endedAt: end.at,
                        cause: end.cause,
                        endedByUserId: null,
                        actorUserId: MANAGER_LINK_SWEEP_ACTOR,
                    });
                    return links.length;
                });
                if (count > 0) {
                    ended += count;
                    managers += 1;
                }
            } catch (error) {
                this.logger.error(
                    `manager_link_sweep could not end links for platformAdmin=${platformAdminId}: ${errorName(error)}`,
                );
            }
        }
        return { ended, managers };
    }

    /**
     * Leave one run waiting at `runAt`, unless one is waiting already.
     * Never throws; false when no run could be left waiting.
     */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: { type: MANAGER_LINK_SWEEP_TYPE, status: "PENDING" },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: { type: MANAGER_LINK_SWEEP_TYPE, payload: {}, runAt },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next manager link sweep: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: MANAGER_LINK_SWEEP_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the manager link sweep chain: ${errorName(error)}`,
            );
        }
    }
}

function errorName(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}
