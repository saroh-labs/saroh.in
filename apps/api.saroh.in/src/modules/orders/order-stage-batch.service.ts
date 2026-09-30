import {
    ConflictException,
    HttpException,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { assertOrdersAtOwnLocation, isLocationScoped } from "./order-location";
import type { LineRow } from "./order-stage-batch-lines";
import {
    isUniqueViolation,
    lockOpenLine,
    refusalOf,
    sameLines,
    undoRefusal,
    viewOf,
} from "./order-stage-batch-lines";
import type {
    CreateStageBatchDto,
    StageBatchView,
} from "./order-stage-batch.dto";
import type { StageActor } from "./order-stage-write";
import { writeStageMove, writeStageUndo } from "./order-stage-write";

/** The job that commits a held batch (`order-stage-batch.handler.ts`). */
export const ORDER_STAGE_BATCH_COMMIT_TYPE = "orders.stage-batch.commit";

/** How long a batch is held before its job commits it: ten seconds. */
export const STAGE_BATCH_HOLD_MS = 10_000;

/**
 * Bulk kitchen moves with a hold and Undo all (round-2 B6, R11).
 *
 * The Orders list posts a batch with an id it made. It is written HELD with
 * its lines and its commit job ten seconds on, in one transaction, so a
 * closed tab loses nothing: the job commits it. "Send now" commits it at
 * once, and "Undo all" cancels it while held, or undoes each moved line
 * once committed.
 *
 * Every line goes through the single order's own stage write
 * (`order-stage-write.ts`), so its stock, its step and A14's customer notice
 * are exactly a single move's, once per order and event. Each line runs in
 * its own transaction: the line's row lock, then the order's, then the move
 * and the line's result together. A line with a result is never run again,
 * so a commit is idempotent, a retry returns what is stored, and the
 * caller's own moves are never reported as someone else's.
 *
 * `order:stage` is enough for all of it, as for a single move (DEC-024).
 */
@Injectable()
export class OrderStageBatchService {
    private readonly logger = new Logger(OrderStageBatchService.name);

    /** Hold a batch, or return the one this id already names. */
    async create(
        ctx: OrganizationContext,
        dto: CreateStageBatchDto,
    ): Promise<StageBatchView> {
        authorize(ctx, "order:stage");
        // A location's team moves its own storefronts' orders (DEC-074).
        await assertOrdersAtOwnLocation(
            ctx,
            dto.lines.map((line) => line.orderId),
        );
        let batch = await this.find(ctx.organizationId, dto.batchId);
        if (batch && isLocationScoped(ctx.roleKey)) {
            batch = await this.mustFindFor(ctx, dto.batchId);
        }
        if (!batch) {
            try {
                await this.hold(ctx, dto);
            } catch (error) {
                // Two tries of one batch at once: the second finds the first.
                if (!isUniqueViolation(error)) throw error;
            }
            batch = await this.find(ctx.organizationId, dto.batchId);
            // The id is taken by another business's batch.
            if (!batch) throw new ConflictException("Try that again.");
        } else if (!sameLines(batch, dto)) {
            throw new ConflictException(
                "That batch was already sent with other orders.",
            );
        }
        if (dto.now && batch.status === "HELD") {
            return this.commitBatch(ctx.organizationId, batch.id);
        }
        return viewOf(batch);
    }

    async get(ctx: OrganizationContext, batchId: string) {
        authorize(ctx, "order:stage");
        return viewOf(await this.mustFindFor(ctx, batchId));
    }

    /** "Send now": commit the held batch at once. */
    async commit(ctx: OrganizationContext, batchId: string) {
        authorize(ctx, "order:stage");
        await this.mustFindFor(ctx, batchId);
        return this.commitBatch(ctx.organizationId, batchId);
    }

    /** Cancel a batch still held; nothing was moved. */
    async cancel(ctx: OrganizationContext, batchId: string) {
        authorize(ctx, "order:stage");
        await this.mustFindFor(ctx, batchId);
        await this.cancelHeld(ctx.organizationId, batchId);
        const batch = await this.mustFind(ctx.organizationId, batchId);
        if (batch.status === "COMMITTED") {
            throw new ConflictException(
                "These orders have already moved. Undo them instead.",
            );
        }
        return viewOf(batch);
    }

    /**
     * "Undo all": cancel it while held; once committed, undo each moved
     * line by its step (the single Undo, within its window). A line whose
     * customer was already told is undone and says so (`told`).
     */
    async undo(ctx: OrganizationContext, batchId: string) {
        authorize(ctx, "order:stage");
        await this.mustFindFor(ctx, batchId);
        await this.cancelHeld(ctx.organizationId, batchId);
        let batch = await this.mustFind(ctx.organizationId, batchId);
        if (batch.status !== "COMMITTED") return viewOf(batch);
        if (!batch.undoneAt) {
            await prisma.orderStageBatch.update({
                where: { id: batchId },
                data: { undoneAt: new Date() },
            });
        }
        for (const line of batch.lines) {
            if (line.undoResult) continue;
            await this.undoLine(ctx, line);
        }
        batch = await this.mustFind(ctx.organizationId, batchId);
        return viewOf(batch);
    }

    /**
     * Commit a batch: the job's way in, and "Send now"'s. Moves every line
     * with no result yet, in the name of whoever asked. A cancelled batch
     * moves nothing. A line that failed for no reason of its own is left
     * without a result and the call throws at the end, so the job retries it.
     */
    async commitBatch(
        organizationId: string,
        batchId: string,
    ): Promise<StageBatchView> {
        await prisma.orderStageBatch.updateMany({
            where: { id: batchId, organizationId, status: "HELD" },
            data: { status: "COMMITTED", committedAt: new Date() },
        });
        const batch = await this.mustFind(organizationId, batchId);
        if (batch.status !== "COMMITTED") return viewOf(batch);
        const actor = { organizationId, userId: batch.actorUserId };
        let failure: Error | null = null;
        for (const line of batch.lines) {
            if (line.result) continue;
            try {
                await this.moveLine(actor, line);
            } catch (error) {
                failure =
                    error instanceof Error ? error : new Error(String(error));
                this.logger.warn(
                    `A bulk move of order ${line.orderId} failed; the job will retry it: ${String(error)}`,
                );
            }
        }
        if (failure) throw failure;
        return viewOf(await this.mustFind(organizationId, batchId));
    }

    /** One line's move and its result, in one transaction. */
    private async moveLine(actor: StageActor, line: LineRow): Promise<void> {
        try {
            await prisma.$transaction(async (tx) => {
                if (!(await lockOpenLine(tx, line.id, "result"))) return;
                const moved = await writeStageMove(
                    tx,
                    actor,
                    line.orderId,
                    { to: line.toStage },
                    line.fromStage,
                );
                await tx.orderStageBatchLine.update({
                    where: { id: line.id },
                    data: { result: "MOVED", stageEventId: moved.eventId },
                });
            });
        } catch (error) {
            const refused = refusalOf(error);
            if (!refused) throw error;
            // The move rolled back; its result is written on its own.
            await prisma.$transaction(async (tx) => {
                if (!(await lockOpenLine(tx, line.id, "result"))) return;
                await tx.orderStageBatchLine.update({
                    where: { id: line.id },
                    data: refused,
                });
            });
        }
    }

    /** One line's Undo, in one transaction; a line never moved is stopped. */
    private async undoLine(actor: StageActor, line: LineRow): Promise<void> {
        try {
            await prisma.$transaction(async (tx) => {
                if (!(await lockOpenLine(tx, line.id, "undoResult"))) return;
                const fresh = await tx.orderStageBatchLine.findUniqueOrThrow({
                    where: { id: line.id },
                });
                if (fresh.result === null) {
                    // Undo reached it before the commit did: it never moves.
                    await tx.orderStageBatchLine.update({
                        where: { id: line.id },
                        data: {
                            result: "CANCELLED",
                            undoResult: "UNDONE",
                            told: false,
                        },
                    });
                    return;
                }
                if (fresh.result !== "MOVED" || !fresh.stageEventId) return;
                const back = await writeStageUndo(
                    tx,
                    actor,
                    fresh.orderId,
                    fresh.stageEventId,
                );
                await tx.orderStageBatchLine.update({
                    where: { id: line.id },
                    data: {
                        undoResult: "UNDONE",
                        undoEventId: back.eventId,
                        told: back.told,
                    },
                });
            });
        } catch (error) {
            if (!(error instanceof HttpException)) throw error;
            const reason = await undoRefusal(actor, line, error);
            await prisma.$transaction(async (tx) => {
                if (!(await lockOpenLine(tx, line.id, "undoResult"))) return;
                await tx.orderStageBatchLine.update({
                    where: { id: line.id },
                    data: { undoResult: "REFUSED", undoReason: reason },
                });
            });
        }
    }

    /** Write the batch HELD, its lines and its commit job, together. */
    private async hold(ctx: OrganizationContext, dto: CreateStageBatchDto) {
        const commitAt = new Date(Date.now() + STAGE_BATCH_HOLD_MS);
        await prisma.$transaction(async (tx) => {
            await tx.orderStageBatch.create({
                data: {
                    id: dto.batchId,
                    organizationId: ctx.organizationId,
                    actorUserId: ctx.userId,
                    commitAt,
                    lines: {
                        create: dto.lines.map((l, position) => ({
                            organizationId: ctx.organizationId,
                            orderId: l.orderId,
                            position,
                            fromStage: l.from,
                            toStage: l.to,
                        })),
                    },
                },
                select: { id: true },
            });
            await tx.job.create({
                data: {
                    organizationId: ctx.organizationId,
                    type: ORDER_STAGE_BATCH_COMMIT_TYPE,
                    payload: { batchId: dto.batchId },
                    runAt: commitAt,
                },
                select: { id: true },
            });
        });
    }

    /** Cancel it if it is still held, and take its job back. */
    private async cancelHeld(organizationId: string, batchId: string) {
        await prisma.$transaction(async (tx) => {
            const { count } = await tx.orderStageBatch.updateMany({
                where: { id: batchId, organizationId, status: "HELD" },
                data: { status: "CANCELLED", cancelledAt: new Date() },
            });
            if (count === 0) return;
            await tx.job.deleteMany({
                where: {
                    organizationId,
                    type: ORDER_STAGE_BATCH_COMMIT_TYPE,
                    status: "PENDING",
                    payload: { path: ["batchId"], equals: batchId },
                },
            });
        });
    }

    /** Whether the batch is there: the job's check before it commits. */
    async exists(organizationId: string, batchId: string): Promise<boolean> {
        return (await this.find(organizationId, batchId)) !== null;
    }

    private find(organizationId: string, batchId: string) {
        return prisma.orderStageBatch.findFirst({
            where: { id: batchId, organizationId },
            include: { lines: { orderBy: { position: "asc" } } },
        });
    }

    private async mustFind(organizationId: string, batchId: string) {
        const batch = await this.find(organizationId, batchId);
        if (!batch) throw new NotFoundException("That batch isn't here.");
        return batch;
    }

    /**
     * The batch, for this caller. A location's team (DEC-074) reaches only
     * the batches they made, whose orders were checked as theirs when held;
     * anyone else's is not there.
     */
    private async mustFindFor(ctx: OrganizationContext, batchId: string) {
        const batch = await this.mustFind(ctx.organizationId, batchId);
        if (isLocationScoped(ctx.roleKey) && batch.actorUserId !== ctx.userId) {
            throw new NotFoundException("That batch isn't here.");
        }
        return batch;
    }
}
