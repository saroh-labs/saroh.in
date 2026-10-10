import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { AdminAuditService } from "./admin-audit.service";
import { AdminAuditOutcome } from "./admin-audit.service";
import type { AdminPermission } from "./admin-permissions";

/** A durable operation an operator stopped before it finished (#907). */
export const OPERATION_CANCELLED = "CANCELLED";

/** What a cancelled operation's untouched rows say. */
export const CANCELLED_ITEM_DETAIL = "Cancelled before it ran";

export interface CancelOperationInput {
    staff: PlatformAdminInfo;
    operationId: string;
    reason: string;
    idempotencyKey: string;
}

/**
 * Stop a durable operation (#907): every row that has not started is
 * recorded SKIPPED ("Cancelled before it ran") and the operation CANCELLED.
 * A row already running finishes and records what it did — nothing is
 * stopped half way. The rows are fenced on PENDING, so a row the runner
 * claims first runs, and one cancelled first is never claimed.
 *
 * Needs the permission the operation was started under (a retry's
 * `jobs:retry`, a replay's `webhooks:replay`, an invite's `waitlist:invite`),
 * and is written to the admin ledger in the same transaction, as starting it
 * was. A repeat with the same key is the same request.
 */
export async function cancelOperation(
    audit: AdminAuditService,
    permissionFor: (kind: string) => AdminPermission | undefined,
    input: CancelOperationInput,
): Promise<{ cancelled: number }> {
    const reason = input.reason.trim();
    if (reason.length < 4) {
        throw new BadRequestException("Give a reason for cancelling it.");
    }
    const auditKey = `operation-cancel:${input.staff.userId}:${input.idempotencyKey}`;
    const repeat = await prisma.adminAuditEvent.findUnique({
        where: { idempotencyKey: auditKey },
        select: { metadata: true },
    });
    if (repeat) {
        const cancelled = (repeat.metadata as { cancelled?: unknown } | null)
            ?.cancelled;
        return { cancelled: typeof cancelled === "number" ? cancelled : 0 };
    }

    const operation = await prisma.adminOperation.findUnique({
        where: { id: input.operationId },
        select: { id: true, kind: true, status: true },
    });
    if (!operation) throw new NotFoundException("Operation not found");
    const permission = permissionFor(operation.kind);
    if (!permission || !input.staff.permissions.includes(permission)) {
        throw new ForbiddenException(
            `Cancelling this needs the ${permission ?? "operation's"} permission.`,
        );
    }

    return prisma.$transaction(async (tx) => {
        // Fenced on the state read: an operation that finished (or was
        // cancelled) in between is not cancelled again.
        const stopped = await tx.adminOperation.updateMany({
            where: {
                id: operation.id,
                status: { in: ["PENDING", "RUNNING"] },
            },
            data: { status: OPERATION_CANCELLED, finishedAt: new Date() },
        });
        if (stopped.count === 0) {
            throw new ConflictException(
                "This operation has already finished; there is nothing left to cancel.",
            );
        }
        const { count } = await tx.adminOperationItem.updateMany({
            where: { operationId: operation.id, status: "PENDING" },
            data: {
                status: "SKIPPED",
                detail: CANCELLED_ITEM_DETAIL,
                processedAt: new Date(),
            },
        });
        if (count > 0) {
            await tx.adminOperation.update({
                where: { id: operation.id },
                data: { skipped: { increment: count } },
            });
        }
        await audit.write(tx, {
            actorUserId: input.staff.userId,
            permission,
            action: `operation.${operation.kind}.cancelled`,
            targetType: "admin_operation",
            targetId: operation.id,
            reason,
            outcome: AdminAuditOutcome.Success,
            idempotencyKey: auditKey,
            metadata: { cancelled: count, from: operation.status },
        });
        return { cancelled: count };
    });
}
