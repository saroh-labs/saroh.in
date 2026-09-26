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
            user: { findMany: jest.fn() },
            organizationInvitation: { findMany: jest.fn() },
            membership: { findMany: jest.fn() },
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
const findUsers = prisma.user.findMany as jest.Mock;
const findInvitations = prisma.organizationInvitation.findMany as jest.Mock;
const findMemberships = prisma.membership.findMany as jest.Mock;

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

    it("marks a Saroh operator's change byOperator, keeping its metadata", async () => {
        await service.record({
            action: AuditAction.MembershipRoleUpdate,
            actorUserId: "u_staff",
            actorRoleKey: "platform-operator",
            organizationId: "org_1",
            targetType: "membership",
            targetId: "u_aditya",
            outcome: AuditOutcome.Success,
            metadata: { from: "MEMBER", to: "ADMIN" },
        });
        await service.record({
            action: AuditAction.MembershipRemove,
            actorUserId: "u_staff",
            actorRoleKey: "platform-operator",
            organizationId: "org_1",
            outcome: AuditOutcome.Success,
        });
        await service.record({
            action: AuditAction.MembershipRoleUpdate,
            actorUserId: "u_priya",
            actorRoleKey: "OWNER",
            organizationId: "org_1",
            outcome: AuditOutcome.Success,
            metadata: { from: "MEMBER", to: "ADMIN" },
        });

        expect(create.mock.calls.map((c) => c[0].data.metadata)).toEqual([
            { from: "MEMBER", to: "ADMIN", byOperator: true },
            { byOperator: true },
            // A member of the business is never marked.
            { from: "MEMBER", to: "ADMIN" },
        ]);
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
        const rows = Array.from({ length: 101 }, (_v, i) => ({
            id: `e${i}`,
            actorUserId: "user_1",
        }));
        findMany.mockResolvedValue(rows);
        findUsers.mockResolvedValue([]);
        findMemberships.mockResolvedValue([]);

        const result = await service.listForOrganization("org_1", {
            limit: 5000,
        });

        expect(findMany.mock.calls[0][0].take).toBe(101); // 100 (cap) + 1
        expect(result.events).toHaveLength(100);
        expect(result.nextCursor).toBe("e99");
    });
});

describe("AuditService.listForOrganization — who each event names", () => {
    let service: AuditService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new AuditService();
    });

    it("narrows to the actions asked for", async () => {
        findMany.mockResolvedValue([]);

        await service.listForOrganization("org_1", {
            actions: [AuditAction.ProfileUpdate, AuditAction.MembershipInvite],
        });

        expect(findMany.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            action: { in: ["profile.update", "membership.invite"] },
        });
    });

    it("reads no people for an empty page", async () => {
        findMany.mockResolvedValue([]);

        await expect(service.listForOrganization("org_1")).resolves.toEqual({
            events: [],
            nextCursor: null,
        });
        expect(findUsers).not.toHaveBeenCalled();
        expect(findInvitations).not.toHaveBeenCalled();
        expect(findMemberships).not.toHaveBeenCalled();
    });

    it("names actors and targets in one query each, as they are now", async () => {
        findMany.mockResolvedValue([
            {
                id: "e1",
                action: "membership.role.update",
                actorUserId: "u_priya",
                targetType: "membership",
                targetId: "u_aditya",
            },
            {
                id: "e2",
                action: "membership.invite",
                actorUserId: "u_priya",
                targetType: "invitation",
                targetId: "inv_1",
            },
            {
                id: "e3",
                action: "profile.update",
                actorUserId: "u_gone",
                targetType: "organization",
                targetId: "org_1",
            },
        ]);
        findUsers.mockResolvedValue([
            { id: "u_priya", name: "Priya", email: "priya@rye.in" },
            { id: "u_aditya", name: null, email: "aditya@rye.in" },
        ]);
        findInvitations.mockResolvedValue([
            { id: "inv_1", email: "meera@rye.in" },
        ]);
        findMemberships.mockResolvedValue([
            { userId: "u_priya", role: "OWNER" },
            { userId: "u_aditya", role: "MEMBER" },
        ]);

        const { events } = await service.listForOrganization("org_1");

        expect(findUsers).toHaveBeenCalledTimes(1);
        expect(findUsers.mock.calls[0][0].where.id.in.sort()).toEqual([
            "u_aditya",
            "u_gone",
            "u_priya",
        ]);
        // Invitations are read within the organization only.
        expect(findInvitations).toHaveBeenCalledWith({
            where: { id: { in: ["inv_1"] }, organizationId: "org_1" },
            select: { id: true, email: true },
        });
        // Their role in THIS business now, in the same one-query-per-kind.
        expect(findMemberships).toHaveBeenCalledTimes(1);
        expect(findMemberships.mock.calls[0][0].where.organizationId).toBe(
            "org_1",
        );
        expect(events.map((e) => [e.actor, e.target])).toEqual([
            [
                { name: "Priya", email: "priya@rye.in", role: "OWNER" },
                { name: null, email: "aditya@rye.in", role: "MEMBER" },
            ],
            [
                { name: "Priya", email: "priya@rye.in", role: "OWNER" },
                { name: null, email: "meera@rye.in", role: null },
            ],
            // Someone no longer there is null, and an organization is not a
            // person.
            [null, null],
        ]);
    });
});

describe("AuditService.listForOrganization — a Saroh operator's change", () => {
    it("is Saroh support's: the operator's name and email are never read or returned", async () => {
        jest.clearAllMocks();
        findMany.mockResolvedValue([
            {
                id: "e1",
                action: "organization.plan.changed",
                actorUserId: "u_staff",
                targetType: "organization",
                targetId: "org_1",
                metadata: { from: "Free", to: "Pro", byOperator: true },
            },
            {
                id: "e2",
                action: "profile.update",
                actorUserId: "u_priya",
                targetType: "organization",
                targetId: "org_1",
                metadata: { fields: ["name"] },
            },
        ]);
        findUsers.mockResolvedValue([
            { id: "u_staff", name: "Staff Person", email: "ops@saroh.in" },
            { id: "u_priya", name: "Priya", email: "priya@rye.in" },
        ]);
        findMemberships.mockResolvedValue([
            { userId: "u_priya", role: "OWNER" },
        ]);

        const { events } = await new AuditService().listForOrganization(
            "org_1",
        );

        // The operator is not even looked up.
        expect(findUsers.mock.calls[0][0].where.id.in).toEqual(["u_priya"]);
        expect(events[0].actor).toEqual({
            name: "Saroh support",
            email: null,
            role: null,
            operator: true,
        });
        expect(JSON.stringify(events)).not.toContain("ops@saroh.in");
        expect(JSON.stringify(events)).not.toContain("Staff Person");
        // Nor their user id, which would tell one operator from another.
        expect(events[0].actorUserId).toBeNull();
        expect(JSON.stringify(events)).not.toContain("u_staff");
        expect(events[1].actorUserId).toBe("u_priya");
        expect(events[1].actor).toEqual({
            name: "Priya",
            email: "priya@rye.in",
            role: "OWNER",
        });
    });
});

describe("AuditService.listForOrganization — what a change recorded", () => {
    it("returns the metadata as recorded: the fields and their values", async () => {
        jest.clearAllMocks();
        const metadata = {
            fields: ["invoicePrefix", "contactEmail"],
            changes: [{ field: "invoicePrefix", before: "INV", after: "RC" }],
        };
        findMany.mockResolvedValue([
            {
                id: "e1",
                action: "profile.update",
                actorUserId: "u_priya",
                targetType: "organization",
                targetId: "org_1",
                metadata,
            },
        ]);
        findUsers.mockResolvedValue([
            { id: "u_priya", name: "Priya", email: "priya@rye.in" },
        ]);
        findMemberships.mockResolvedValue([]);

        const { events } = await new AuditService().listForOrganization(
            "org_1",
        );

        expect(events[0].metadata).toEqual(metadata);
        // Someone who has left keeps their name, with no role here.
        expect(events[0].actor).toEqual({
            name: "Priya",
            email: "priya@rye.in",
            role: null,
        });
    });
});
