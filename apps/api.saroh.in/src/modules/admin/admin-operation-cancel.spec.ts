jest.mock("@saroh/database", () => {
    const prisma = {
        adminAuditEvent: { findUnique: jest.fn() },
        adminOperation: {
            findUnique: jest.fn(),
            updateMany: jest.fn(),
            update: jest.fn(),
        },
        adminOperationItem: { updateMany: jest.fn() },
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    return { prisma };
});

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { AdminAuditService } from "./admin-audit.service";
import {
    CANCELLED_ITEM_DETAIL,
    cancelOperation,
    OPERATION_CANCELLED,
} from "./admin-operation-cancel";
import { AdminPermission } from "./admin-permissions";

const repeatFind = prisma.adminAuditEvent.findUnique as jest.Mock;
const opFind = prisma.adminOperation.findUnique as jest.Mock;
const opStop = prisma.adminOperation.updateMany as jest.Mock;
const opUpdate = prisma.adminOperation.update as jest.Mock;
const itemsSkip = prisma.adminOperationItem.updateMany as jest.Mock;

const staff = (permissions: AdminPermission[]): PlatformAdminInfo => ({
    userId: "ops_1",
    platformAdminId: "pa_1",
    roles: ["OPERATIONS"],
    permissions,
    viaBootstrap: false,
});

const permissionFor = (kind: string) =>
    kind === "jobs.retry" ? AdminPermission.JobsRetry : undefined;

function run(
    permissions: AdminPermission[] = [AdminPermission.JobsRetry],
    reason = "Wrong jobs picked",
) {
    const audit = { write: jest.fn() };
    const result = cancelOperation(
        audit as unknown as AdminAuditService,
        permissionFor,
        {
            staff: staff(permissions),
            operationId: "op_1",
            reason,
            idempotencyKey: "key-12345",
        },
    );
    return { audit, result };
}

beforeEach(() => {
    jest.clearAllMocks();
    repeatFind.mockResolvedValue(null);
    opFind.mockResolvedValue({
        id: "op_1",
        kind: "jobs.retry",
        status: "RUNNING",
    });
    opStop.mockResolvedValue({ count: 1 });
    itemsSkip.mockResolvedValue({ count: 3 });
});

describe("cancelOperation (#907)", () => {
    it("skips the rows not started and records it, audited like a start", async () => {
        const { audit, result } = run();
        await expect(result).resolves.toEqual({ cancelled: 3 });

        expect(opStop).toHaveBeenCalledWith({
            where: { id: "op_1", status: { in: ["PENDING", "RUNNING"] } },
            data: { status: OPERATION_CANCELLED, finishedAt: expect.any(Date) },
        });
        // Only rows still PENDING: a running row finishes what it started.
        expect(itemsSkip).toHaveBeenCalledWith({
            where: { operationId: "op_1", status: "PENDING" },
            data: expect.objectContaining({
                status: "SKIPPED",
                detail: CANCELLED_ITEM_DETAIL,
            }),
        });
        expect(opUpdate).toHaveBeenCalledWith({
            where: { id: "op_1" },
            data: { skipped: { increment: 3 } },
        });
        expect(audit.write).toHaveBeenCalledWith(
            prisma,
            expect.objectContaining({
                permission: AdminPermission.JobsRetry,
                action: "operation.jobs.retry.cancelled",
                targetType: "admin_operation",
                targetId: "op_1",
                reason: "Wrong jobs picked",
                outcome: "SUCCESS",
                idempotencyKey: "operation-cancel:ops_1:key-12345",
                metadata: { cancelled: 3, from: "RUNNING" },
            }),
        );
    });

    it("needs the permission the operation was started under", async () => {
        const { result } = run([AdminPermission.PlatformRead]);
        await expect(result).rejects.toBeInstanceOf(ForbiddenException);
        expect(opStop).not.toHaveBeenCalled();
    });

    it("refuses a finished operation", async () => {
        opStop.mockResolvedValue({ count: 0 });
        const { audit, result } = run();
        await expect(result).rejects.toBeInstanceOf(ConflictException);
        expect(itemsSkip).not.toHaveBeenCalled();
        expect(audit.write).not.toHaveBeenCalled();
    });

    it("asks for a reason", async () => {
        const { result } = run(undefined, "  ");
        await expect(result).rejects.toBeInstanceOf(BadRequestException);
    });

    it("answers a repeat with the same key without acting again", async () => {
        repeatFind.mockResolvedValue({ metadata: { cancelled: 2 } });
        const { result } = run();
        await expect(result).resolves.toEqual({ cancelled: 2 });
        expect(opFind).not.toHaveBeenCalled();
        expect(opStop).not.toHaveBeenCalled();
    });
});
