// Mock the database package so the service never touches a real Postgres. Only
// `auditEvent.create` is provided — the model is append-only, so there is no
// update/delete to mock. `record` must call create exactly once and nothing else.
jest.mock("@saroh/database", () => {
    return {
        prisma: {
            auditEvent: {
                create: jest.fn(),
                // Present so a test can assert they are NEVER called; the real
                // service has no code path that reaches them.
                update: jest.fn(),
                updateMany: jest.fn(),
                delete: jest.fn(),
                deleteMany: jest.fn(),
                findMany: jest.fn(),
            },
        },
    };
});

import { prisma } from "@saroh/database";

import { AuditAction, AuditOutcome, AuditService } from "./audit.service";

const create = prisma.auditEvent.create as jest.Mock;
const update = prisma.auditEvent.update as jest.Mock;
const updateMany = prisma.auditEvent.updateMany as jest.Mock;
const del = prisma.auditEvent.delete as jest.Mock;
const deleteMany = prisma.auditEvent.deleteMany as jest.Mock;
const findMany = prisma.auditEvent.findMany as jest.Mock;

describe("AuditService.record", () => {
    let service: AuditService;

    beforeEach(() => {
        jest.clearAllMocks();
        create.mockResolvedValue({ id: "evt_1" });
        service = new AuditService();
    });

    it("writes exactly one row and never updates/deletes", async () => {
        await service.record({
            action: AuditAction.MembershipInvite,
            actorUserId: "user_1",
            organizationId: "org_1",
            targetType: "membership",
            targetId: "mem_1",
            outcome: AuditOutcome.Success,
            metadata: { role: "MEMBER" },
        });

        expect(create).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledWith({
            data: {
                action: "membership.invite",
                actorUserId: "user_1",
                organizationId: "org_1",
                projectId: undefined,
                targetType: "membership",
                targetId: "mem_1",
                outcome: "SUCCESS",
                metadata: { role: "MEMBER" },
            },
        });

        // Append-only: no mutation of existing history, ever.
        expect(update).not.toHaveBeenCalled();
        expect(updateMany).not.toHaveBeenCalled();
        expect(del).not.toHaveBeenCalled();
        expect(deleteMany).not.toHaveBeenCalled();
    });

    it("swallows a prisma failure and does not throw into the caller", async () => {
        const boom = new Error("connection reset");
        create.mockRejectedValueOnce(boom);
        // Silence the expected Logger.error output for a clean test run.
        const errorSpy = jest
            .spyOn(
                (service as unknown as { logger: { error: () => void } })
                    .logger,
                "error",
            )
            .mockImplementation(() => undefined);

        await expect(
            service.record({
                action: AuditAction.SecretAccess,
                actorUserId: "user_1",
                organizationId: "org_1",
                outcome: AuditOutcome.Failure,
            }),
        ).resolves.toBeUndefined();

        expect(create).toHaveBeenCalledTimes(1);
        // The failure was logged, not rethrown.
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });
});

describe("AuditService.listForOrganization", () => {
    let service: AuditService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new AuditService();
    });

    it("scopes to the org, orders newest-first, and bounds the page", async () => {
        findMany.mockResolvedValue([]);

        await service.listForOrganization("org_1");

        expect(findMany).toHaveBeenCalledTimes(1);
        const arg = findMany.mock.calls[0][0];
        expect(arg.where).toEqual({ organizationId: "org_1" });
        expect(arg.orderBy).toEqual({ createdAt: "desc" });
        // take is limit + 1 (has-more probe); default limit is 50.
        expect(arg.take).toBe(51);
    });

    it("caps an over-large limit and returns a cursor when more remain", async () => {
        // 101 rows for a requested limit of 100 → hasMore, one trimmed off.
        const rows = Array.from({ length: 101 }, (_v, i) => ({ id: `e${i}` }));
        findMany.mockResolvedValue(rows);

        const result = await service.listForOrganization("org_1", {
            limit: 5000,
        });

        expect(findMany.mock.calls[0][0].take).toBe(101); // 100 (cap) + 1
        expect(result.events).toHaveLength(100);
        expect(result.nextCursor).toBe("e99");
    });
});
