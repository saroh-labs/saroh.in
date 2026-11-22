import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { heldOrganizationIds } from "../organizations/legal-hold";
import type { MediaStorages } from "./object-storage.provider";
import { OBJECT_STORAGE } from "./object-storage.provider";
import { mediaFileKeys } from "./variants";

/** The sweep, every 15 minutes, of uploads started and never confirmed (M-5). */
export const PENDING_UPLOAD_SWEEP_TYPE = "media.pending-sweep";

export const PENDING_UPLOAD_SWEEP_EVERY_MS = 15 * 60 * 1000;

/**
 * How long an unconfirmed upload is left before it is swept: past the
 * signed URLs' ten minutes, so an upload still finishing is never taken
 * (DEC-246: 15 minutes, down from two hours).
 */
export const PENDING_UPLOAD_STALE_MS = 15 * 60 * 1000;

const CHAIN_LOCK = `job-chain:${PENDING_UPLOAD_SWEEP_TYPE}`;
const BATCH = 100;

/**
 * `media.pending-sweep` (M-5, owner 20 Nov 2026): an upload whose URL was
 * signed but which was never confirmed holds its space against the plan's
 * storage (`billing/metering.ts`) until this deletes its object and its
 * row, fifteen minutes after it started. A READY or FAILED row is never touched;
 * a business on legal hold keeps everything (DEC-122).
 *
 * Each row goes in its own transaction: the row is taken only while still
 * PENDING, and the object deleted before the commit, so a storage failure
 * leaves the row for the next run and a confirm racing it finds no row.
 * A row that fails is not read again this run.
 *
 * It reschedules itself (ADR-007), one waiting run at a time under the
 * advisory lock `job-chain:media.pending-sweep`; it throws only when the
 * next run can't be enqueued.
 */
@Injectable()
export class PendingUploadSweepJob {
    private readonly logger = new Logger(PendingUploadSweepJob.name);

    /** Rows read at a time; tests make it small. */
    batch = BATCH;

    constructor(
        @Inject(OBJECT_STORAGE) private readonly storages: MediaStorages,
    ) {}

    readonly handle = async (_job: Job): Promise<void> => {
        const now = new Date();
        try {
            const r = await this.sweep(now);
            if (r.removed + r.failed > 0) {
                this.logger.log(
                    `pending_upload_sweep removed=${r.removed} failed=${r.failed}`,
                );
            }
        } catch (error) {
            this.logger.error(
                `pending_upload_sweep failed before it finished: ${errorName(error)}`,
            );
        }
        const next = new Date(now.getTime() + PENDING_UPLOAD_SWEEP_EVERY_MS);
        if (!(await this.schedule(next))) {
            throw new Error(
                "Could not schedule the next pending upload sweep; retrying this one",
            );
        }
    };

    async sweep(now: Date): Promise<{ removed: number; failed: number }> {
        const before = new Date(now.getTime() - PENDING_UPLOAD_STALE_MS);
        const failedIds: string[] = [];
        let removed = 0;
        for (;;) {
            // Read again for every batch: a hold placed mid-run counts (N12).
            const held = await heldOrganizationIds(prisma);
            const rows = await prisma.media.findMany({
                where: {
                    status: "PENDING",
                    createdAt: { lt: before },
                    organizationId: { notIn: held },
                    ...(failedIds.length > 0
                        ? { id: { notIn: failedIds } }
                        : {}),
                },
                select: { id: true, key: true, variants: true, bucket: true },
                orderBy: { id: "asc" },
                take: this.batch,
            });
            if (rows.length === 0) break;
            for (const row of rows) {
                try {
                    removed += await prisma.$transaction(async (tx) => {
                        const taken = await tx.media.deleteMany({
                            where: { id: row.id, status: "PENDING" },
                        });
                        if (taken.count > 0) {
                            // The photo and every copy the browser sent, in
                            // the bucket it was signed for (either one).
                            const storage = this.storages.of(row.bucket);
                            for (const key of mediaFileKeys(row)) {
                                await storage.deleteObject(key);
                            }
                        }
                        return taken.count;
                    });
                } catch (error) {
                    failedIds.push(row.id);
                    this.logger.warn(
                        `pending_upload_sweep could not remove media=${row.id}: ${errorName(error)}`,
                    );
                }
            }
        }
        return { removed, failed: failedIds.length };
    }

    /** Leave one run waiting at `runAt`, unless one is. False when none could be. */
    async schedule(runAt: Date): Promise<boolean> {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CHAIN_LOCK}))`;
                const waiting = await tx.job.count({
                    where: {
                        type: PENDING_UPLOAD_SWEEP_TYPE,
                        status: "PENDING",
                    },
                });
                if (waiting > 0) return;
                await tx.job.create({
                    data: {
                        type: PENDING_UPLOAD_SWEEP_TYPE,
                        payload: {},
                        runAt,
                    },
                });
            });
            return true;
        } catch (error) {
            this.logger.error(
                `Could not schedule the next pending upload sweep: ${errorName(error)}`,
            );
            return false;
        }
    }

    /** Restart the chain when nothing is waiting or running. */
    async ensureScheduled(now: Date = new Date()): Promise<void> {
        try {
            const live = await prisma.job.count({
                where: {
                    type: PENDING_UPLOAD_SWEEP_TYPE,
                    status: { in: ["PENDING", "PROCESSING"] },
                },
            });
            if (live > 0) return;
            await this.schedule(now);
        } catch (error) {
            this.logger.error(
                `Could not check the pending upload sweep chain: ${errorName(error)}`,
            );
        }
    }
}

function errorName(error: unknown): string {
    return error instanceof Error ? error.name : "unknown error";
}
