import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { WalletService } from "./wallet.service";

/** The sweep that gives back stale WhatsApp holds and expires old balances. */
export const WALLET_SWEEP_TYPE = "messaging.wallet-sweep";

/** Hourly: a stale hold waits at most an hour past its 24. */
export const WALLET_SWEEP_EVERY_MS = 60 * 60 * 1000;

/** The key that lets one waiting run of the chain exist at a time. */
const CHAIN_LOCK = `job-chain:${WALLET_SWEEP_TYPE}`;

/**
 * `messaging.wallet-sweep` (#1240): runs `WalletService.expireSweep` and
 * reschedules itself (ADR-007), with one waiting run kept by a transaction
 * advisory lock on `job-chain:messaging.wallet-sweep`, as the pack expiry
 * sweep does. Throws only when the next run can't be enqueued.
 */
@Injectable()
export class WalletSweepHandler {
    private readonly logger = new Logger(WalletSweepHandler.name);

    constructor(private readonly wallet: WalletService) {}

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const { released, expired } = await this.wallet.expireSweep(now);
            if (released + expired > 0) {
                this.logger.log(
                    `wallet_sweep released=${released} expired=${expired}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `wallet_sweep failed before it finished: ${errorName(error)}`,
            );
        }
        if (
            !(await this.schedule(
                new Date(now.getTime() + WALLET_SWEEP_EVERY_MS),
            ))
        ) {
            throw new Error(
                "Could not schedule the next wallet sweep; retrying this one",
            );
        }
    };

    /** Leave one run waiting at `runAt`, unless one is. False when none could be. */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: { type: WALLET_SWEEP_TYPE, status: "PENDING" },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: { type: WALLET_SWEEP_TYPE, payload: {}, runAt },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next wallet sweep: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: WALLET_SWEEP_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the wallet sweep chain: ${errorName(error)}`,
            );
        }
    }
}

function errorName(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}
