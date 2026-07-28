jest.mock("@saroh/database", () => ({
    prisma: {
        adminAuditEvent: {
            create: jest.fn(),
            findMany: jest.fn(),
        },
    },
}));

jest.mock("../../common/logging/request-context", () => ({
    getCorrelationId: jest.fn(() => "request_123"),
}));

import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

const create = prisma.adminAuditEvent.create as jest.Mock;
const findMany = prisma.adminAuditEvent.findMany as jest.Mock;

const input = {
    actorUserId: "user_1",
    permission: AdminPermission.PlatformRead,
    action: "admin.metrics.read",
    targetType: "platform",
    outcome: "SUCCESS" as const,
};

describe("AdminAuditService", () => {
    const service = new AdminAuditService();

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("writes safe metadata with the current correlation id", async () => {
        const tx = {
            adminAuditEvent: { create: jest.fn().mockResolvedValue({}) },
        };

        await service.write(tx as never, {
            ...input,
            metadata: { view: "summary", filters: ["active"] },
        });

        expect(tx.adminAuditEvent.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                ...input,
                correlationId: "request_123",
                metadata: { view: "summary", filters: ["active"] },
            }),
        });
    });

    it.each([
        { accessToken: "do-not-store" },
        { nested: { client_secret: "do-not-store" } },
        { items: [{ credentialId: "do-not-store" }] },
        { headers: { Authorization: "Bearer do-not-store" } },
        { webhookSignature: "do-not-store" },
        { requestPayload: { safeLooking: true } },
        { passwordHash: "do-not-store" },
    ])("rejects secret-bearing metadata recursively: %p", async (metadata) => {
        const tx = {
            adminAuditEvent: { create: jest.fn() },
        };

        await expect(
            service.write(tx as never, { ...input, metadata }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.adminAuditEvent.create).not.toHaveBeenCalled();
    });

    it("propagates transactional write failures", async () => {
        const failure = new Error("audit unavailable");
        const tx = {
            adminAuditEvent: {
                create: jest.fn().mockRejectedValue(failure),
            },
        };

        await expect(service.write(tx as never, input)).rejects.toBe(failure);
    });

    it("logs a read-audit failure without hiding the original read result", async () => {
        create.mockRejectedValue(new Error("audit unavailable"));
        const error = jest
            .spyOn(
                (service as unknown as { logger: { error: () => void } })
                    .logger,
                "error",
            )
            .mockImplementation(() => undefined);

        await expect(service.recordRead(input)).resolves.toBeUndefined();
        expect(error).toHaveBeenCalled();
    });

    it("returns bounded cursor pages and applies supported filters", async () => {
        findMany.mockResolvedValue(
            Array.from({ length: 101 }, (_, index) => ({
                id: `event_${index}`,
                createdAt: new Date(2026, 0, 1, 0, 0, index),
            })),
        );

        const page = await service.list({
            limit: 500,
            cursor: "event_before",
            actorUserId: "user_1",
            organizationId: "org_1",
            action: "flags.global.set",
        });

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    actorUserId: "user_1",
                    organizationId: "org_1",
                    action: "flags.global.set",
                },
                cursor: { id: "event_before" },
                skip: 1,
                take: 101,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            }),
        );
        expect(page.items).toHaveLength(100);
        expect(page.nextCursor).toBe("event_99");
    });
});
