import { HttpException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { STAGE_WORDS } from "./order-stage";
import type {
    CreateStageBatchDto,
    StageBatchLineView,
    StageBatchResult,
    StageBatchView,
} from "./order-stage-batch.dto";
import type { StageActor } from "./order-stage-write";
import { StageMovedOnError } from "./order-stage-write";

/**
 * A bulk move's lines (round-2 B6): the lock that keeps a commit and an
 * Undo from running one twice, what a refusal is recorded as, and the view
 * the list reads back. Split from `order-stage-batch.service.ts`, which
 * keeps the batch's flow.
 */

export type BatchRow = Prisma.OrderStageBatchGetPayload<{
    include: { lines: true };
}>;
export type LineRow = BatchRow["lines"][number];

/**
 * Lock the line and say whether `column` is still empty: the one check
 * that keeps a commit and an Undo from running a line twice.
 */
export async function lockOpenLine(
    tx: Prisma.TransactionClient,
    lineId: string,
    column: "result" | "undoResult",
): Promise<boolean> {
    const rows = await tx.$queryRaw<
        { result: string | null; undoResult: string | null }[]
    >`SELECT "result", "undoResult" FROM "OrderStageBatchLine" WHERE id = ${lineId} FOR UPDATE`;
    const row = rows[0];
    return Boolean(row) && row[column] === null;
}

/**
 * A line the order itself refused, as a result to record; null for a
 * failure that is nobody's answer (a lost connection), which is retried.
 */
export function refusalOf(
    error: unknown,
): { result: StageBatchResult; reason: string } | null {
    if (error instanceof StageMovedOnError) {
        return {
            result: "MOVED_BY_SOMEONE_ELSE",
            reason: "moved by someone else",
        };
    }
    if (error instanceof NotFoundException) {
        return { result: "NOT_FOUND", reason: "not found" };
    }
    if (error instanceof HttpException) {
        return { result: "REFUSED", reason: refusalWords(error) };
    }
    return null;
}

/** The order's own refusal, in the few words a result line takes. */
function refusalWords(error: HttpException): string {
    const message = messageOf(error);
    if (/not paid yet/i.test(message)) return "not paid yet";
    if (/was cancelled/i.test(message)) return "cancelled";
    return message;
}

/** Why an Undo was refused: where the order is now, when it moved on. */
export async function undoRefusal(
    actor: StageActor,
    line: LineRow,
    error: HttpException,
): Promise<string> {
    const order = await prisma.order.findFirst({
        where: { id: line.orderId, organizationId: actor.organizationId },
        select: { stage: true },
    });
    if (order && order.stage !== line.toStage) {
        return `already ${STAGE_WORDS[order.stage]}`;
    }
    const message = messageOf(error);
    return /too late/i.test(message) ? "too late to undo" : message;
}

function messageOf(error: HttpException): string {
    const body = error.getResponse();
    if (typeof body === "string") return body;
    const message = (body as { message?: unknown }).message;
    return typeof message === "string" ? message : error.message;
}

export function sameLines(batch: BatchRow, dto: CreateStageBatchDto): boolean {
    if (batch.lines.length !== dto.lines.length) return false;
    return dto.lines.every((l, i) => {
        const line = batch.lines[i];
        return (
            line.orderId === l.orderId &&
            line.fromStage === l.from &&
            line.toStage === l.to
        );
    });
}

export function viewOf(batch: BatchRow): StageBatchView {
    return {
        id: batch.id,
        status: batch.status,
        commitAt: batch.commitAt.toISOString(),
        committedAt: batch.committedAt?.toISOString() ?? null,
        undoneAt: batch.undoneAt?.toISOString() ?? null,
        lines: batch.lines.map(lineView),
    };
}

function lineView(line: LineRow): StageBatchLineView {
    return {
        orderId: line.orderId,
        from: line.fromStage,
        to: line.toStage,
        result: (line.result ?? "PENDING") as StageBatchResult,
        reason: line.reason,
        eventId: line.stageEventId,
        undo: line.undoResult
            ? {
                  result: line.undoResult as "UNDONE" | "REFUSED",
                  reason: line.undoReason,
                  told: line.told ?? false,
              }
            : null,
    };
}

export function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "P2002"
    );
}
