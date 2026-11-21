jest.mock("@saroh/database", () => ({
    prisma: {
        adminAuditEvent: {
            create: jest.fn(),
            findMany: jest.fn(),
        },
        user: { findMany: jest.fn() },
        organization: { findMany: jest.fn() },
    },
    outsideOrgContext: (fn: () => unknown) => fn(),
}));

jest.mock("../../common/logging/request-context", () => ({
    getRequestContext: jest.fn(() => ({
        correlationId: "request_123",
        ip: "203.0.113.9",
        userAgent: "Browser/1",
        sessionId: "sess_1",
    })),
}));

import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { AdminAuditService } from "./admin-audit.service";
import { AdminPermission } from "./admin-permissions";

const create = prisma.adminAuditEvent.create as jest.Mock;
const findMany = prisma.adminAuditEvent.findMany as jest.Mock;
const findUsers = prisma.user.findMany as jest.Mock;
const findOrgs = prisma.organization.findMany as jest.Mock;

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
        findUsers.mockResolvedValue([]);
        findOrgs.mockResolvedValue([]);
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
                ipAddress: "203.0.113.9",
                userAgent: "Browser/1",
                sessionId: "sess_1",
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
                    AND: [
                        { actorUserId: "user_1" },
                        { organizationId: "org_1" },
                        { action: "flags.global.set" },
                        {},
                        {},
                        {},
                    ],
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

    it("filters by an actor's or a business's name, and names them (B6)", async () => {
        findUsers
            .mockResolvedValueOnce([{ id: "user_1" }])
            .mockResolvedValueOnce([
                {
                    id: "user_1",
                    name: "Asha",
                    email: "asha@example.com",
                    platformAdmin: { id: "pa_1" },
                },
            ]);
        findOrgs
            .mockResolvedValueOnce([{ id: "org_1" }])
            .mockResolvedValueOnce([{ id: "org_1", name: "Rye Bakery" }]);
        findMany.mockResolvedValue([
            {
                id: "e1",
                actorUserId: "user_1",
                organizationId: "org_1",
                createdAt: new Date(),
            },
        ]);

        const page = await service.list({ actor: "ash", business: "rye" });

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    AND: expect.arrayContaining([
                        { actorUserId: { in: ["user_1"] } },
                        { organizationId: { in: ["org_1"] } },
                    ]),
                },
            }),
        );
        expect(page.items[0]).toEqual(
            expect.objectContaining({
                actorName: "Asha",
                organizationName: "Rye Bakery",
            }),
        );
    });

    it("names and searches staff only, and keeps to the console's edition (A1)", async () => {
        findUsers.mockReset();
        findOrgs.mockReset();
        findUsers.mockResolvedValueOnce([]).mockResolvedValueOnce([
            {
                id: "merchant_1",
                name: "Ravi",
                email: "ravi@example.com",
                platformAdmin: null,
            },
        ]);
        findOrgs
            .mockResolvedValueOnce([{ id: "org_in" }]) // the edition's ids
            .mockResolvedValueOnce([]); // the page's names
        findMany.mockResolvedValue([
            {
                id: "e1",
                actorUserId: "merchant_1",
                organizationId: null,
                createdAt: new Date(),
            },
        ]);

        const page = await service.list({ actor: "ravi" }, "INDIA" as never);

        expect(findUsers.mock.calls[0][0].where).toEqual(
            expect.objectContaining({ platformAdmin: { isNot: null } }),
        );
        expect(findMany.mock.calls.at(-1)[0].where.AND).toContainEqual({
            OR: [
                { organizationId: null },
                { organizationId: { in: ["org_in"] } },
            ],
        });
        expect(page.items[0].actorName).toBe("Non-staff account");
    });
});
