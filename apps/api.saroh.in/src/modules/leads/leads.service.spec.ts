// DB-free unit tests: the database package is mocked so nothing touches a real
// Postgres. `$transaction` runs its callback against a tx stub whose delegates
// are the same jest mocks, so we can assert the atomic move (stage update +
// STAGE_CHANGED activity) happened inside one transaction.
jest.mock("@saroh/database", () => {
    const lead = {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    };
    const contact = { findUnique: jest.fn(), upsert: jest.fn() };
    const stage = { findUnique: jest.fn() };
    const activity = {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
    };
    const pipeline = {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
    };
    return {
        prisma: {
            lead,
            contact,
            stage,
            activity,
            pipeline,
            // Run the callback synchronously with a tx that reuses the mocks.
            $transaction: jest.fn((cb) =>
                cb({ lead, activity, contact, stage, pipeline }),
            ),
        },
    };
});

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PipelinesService } from "../pipelines/pipelines.service";
import { LeadsService } from "./leads.service";

const leadFindMany = prisma.lead.findMany as jest.Mock;
const leadFindUnique = prisma.lead.findUnique as jest.Mock;
const leadCreate = prisma.lead.create as jest.Mock;
const leadUpdate = prisma.lead.update as jest.Mock;
const contactFindUnique = prisma.contact.findUnique as jest.Mock;
const contactUpsert = prisma.contact.upsert as jest.Mock;
const stageFindUnique = prisma.stage.findUnique as jest.Mock;
const activityCreate = prisma.activity.create as jest.Mock;
const activityFindMany = prisma.activity.findMany as jest.Mock;
const activityFindUnique = prisma.activity.findUnique as jest.Mock;
const activityUpdate = prisma.activity.update as jest.Mock;
const pipelineFindUnique = prisma.pipeline.findUnique as jest.Mock;
const txMock = prisma.$transaction as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

function makeService(): LeadsService {
    return new LeadsService(new PipelinesService());
}

describe("LeadsService.list", () => {
    beforeEach(() => jest.clearAllMocks());

    it("scopes to the ctx org, newest first, with optional filters applied", async () => {
        const service = makeService();
        leadFindMany.mockResolvedValue([]);

        await service.list(ctx(), { pipelineId: "p_1", stageId: "s_1" });

        expect(leadFindMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                pipelineId: "p_1",
                stageId: "s_1",
            },
            orderBy: { createdAt: "desc" },
            include: { contact: true, stage: true },
        });
    });

    it("denies a MEMBER (lead:read is OWNER/ADMIN-only) before any I/O", async () => {
        const service = makeService();
        await expect(
            service.list(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(leadFindMany).not.toHaveBeenCalled();
    });
});

describe("LeadsService.get", () => {
    beforeEach(() => jest.clearAllMocks());

    it("404s a cross-tenant lead", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_OTHER",
        });

        await expect(service.get(ctx(), "l_1")).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("returns an owned lead with contact + ordered activities", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
            activities: [],
        });

        const res = await service.get(ctx(), "l_1");
        expect(res.id).toBe("l_1");
        expect(leadFindUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                include: expect.objectContaining({
                    activities: { orderBy: { createdAt: "asc" } },
                }),
            }),
        );
    });
});

describe("LeadsService.move", () => {
    beforeEach(() => jest.clearAllMocks());

    it("updates stageId AND appends a STAGE_CHANGED activity atomically", async () => {
        const service = makeService();
        // The lead being moved (owned by org_1, currently at s_from).
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
            pipelineId: "p_1",
            stageId: "s_from",
        });
        // stage lookups: the origin then the destination.
        stageFindUnique.mockImplementation(
            ({ where }: { where: { id: string } }) => {
                if (where.id === "s_from") {
                    return Promise.resolve({
                        id: "s_from",
                        organizationId: "org_1",
                        pipelineId: "p_1",
                        name: "New",
                    });
                }
                if (where.id === "s_to") {
                    return Promise.resolve({
                        id: "s_to",
                        organizationId: "org_1",
                        pipelineId: "p_1",
                        name: "Won",
                    });
                }
                return Promise.resolve(null);
            },
        );
        leadUpdate.mockResolvedValue({ id: "l_1", stageId: "s_to" });

        const res = await service.move(ctx(), "l_1", { stageId: "s_to" });

        // Both writes went through the SAME $transaction callback.
        expect(txMock).toHaveBeenCalledTimes(1);
        expect(leadUpdate).toHaveBeenCalledWith({
            where: { id: "l_1" },
            data: { stageId: "s_to" },
        });
        expect(activityCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: "org_1",
                leadId: "l_1",
                type: "STAGE_CHANGED",
                actorUserId: "user_1",
            }),
        });
        expect(res.stageId).toBe("s_to");
    });

    it("rejects a target stage outside the lead's pipeline (400) and writes nothing", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
            pipelineId: "p_1",
            stageId: "s_from",
        });
        stageFindUnique.mockImplementation(
            ({ where }: { where: { id: string } }) => {
                if (where.id === "s_from") {
                    return Promise.resolve({
                        id: "s_from",
                        organizationId: "org_1",
                        pipelineId: "p_1",
                        name: "New",
                    });
                }
                // Destination is a real stage but of a DIFFERENT pipeline.
                return Promise.resolve({
                    id: "s_to",
                    organizationId: "org_1",
                    pipelineId: "p_OTHER",
                    name: "Elsewhere",
                });
            },
        );

        await expect(
            service.move(ctx(), "l_1", { stageId: "s_to" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(txMock).not.toHaveBeenCalled();
        expect(leadUpdate).not.toHaveBeenCalled();
        expect(activityCreate).not.toHaveBeenCalled();
    });

    it("404s a cross-tenant lead before touching stages", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_OTHER",
            pipelineId: "p_1",
            stageId: "s_from",
        });

        await expect(
            service.move(ctx(), "l_1", { stageId: "s_to" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(stageFindUnique).not.toHaveBeenCalled();
    });

    it("denies a MEMBER before any I/O", async () => {
        const service = makeService();
        await expect(
            service.move(ctx({ role: "MEMBER" }), "l_1", { stageId: "s_to" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(leadFindUnique).not.toHaveBeenCalled();
    });
});

describe("LeadsService.create", () => {
    beforeEach(() => jest.clearAllMocks());

    it("uses an owned contact + explicit pipeline/stage and logs a CREATED activity", async () => {
        const service = makeService();
        contactFindUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_1",
        });
        pipelineFindUnique.mockResolvedValue({
            id: "p_1",
            organizationId: "org_1",
            stages: [{ id: "s_1", order: 0 }],
        });
        leadCreate.mockResolvedValue({ id: "l_new" });

        const res = await service.create(ctx(), {
            contactId: "c_1",
            pipelineId: "p_1",
            stageId: "s_1",
            title: "Big deal",
        });

        expect(leadCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: "org_1",
                contactId: "c_1",
                pipelineId: "p_1",
                stageId: "s_1",
                title: "Big deal",
                status: "OPEN",
            }),
        });
        expect(activityCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ type: "CREATED" }),
        });
        expect(res.id).toBe("l_new");
    });

    it("upserts an inline contact by email when no contactId is given", async () => {
        const service = makeService();
        contactUpsert.mockResolvedValue({ id: "c_up" });
        pipelineFindUnique.mockResolvedValue({
            id: "p_1",
            organizationId: "org_1",
            stages: [{ id: "s_1", order: 0 }],
        });
        leadCreate.mockResolvedValue({ id: "l_new" });

        await service.create(ctx(), {
            contact: { email: "jo@acme.com" },
            pipelineId: "p_1",
            title: "Inline",
        });

        expect(contactUpsert).toHaveBeenCalled();
        expect(leadCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ contactId: "c_up" }),
        });
    });

    it("400s when neither contactId nor inline contact is supplied", async () => {
        const service = makeService();
        await expect(
            service.create(ctx(), { title: "Orphan" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(leadCreate).not.toHaveBeenCalled();
    });

    it("404s (and never creates) a cross-tenant contactId", async () => {
        const service = makeService();
        contactFindUnique.mockResolvedValue({
            id: "c_1",
            organizationId: "org_OTHER",
        });

        await expect(
            service.create(ctx(), { contactId: "c_1", title: "x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(leadCreate).not.toHaveBeenCalled();
    });

    it("denies a MEMBER before any I/O", async () => {
        const service = makeService();
        await expect(
            service.create(ctx({ role: "MEMBER" }), { title: "x" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(contactFindUnique).not.toHaveBeenCalled();
    });
});

describe("LeadsService.update", () => {
    beforeEach(() => jest.clearAllMocks());

    it("patches only supplied fields of an owned lead", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
        });
        leadUpdate.mockResolvedValue({ id: "l_1" });

        await service.update(ctx(), "l_1", { status: "WON" });

        expect(leadUpdate).toHaveBeenCalledWith({
            where: { id: "l_1" },
            data: { status: "WON" },
        });
    });

    it("404s a cross-tenant lead and writes nothing", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_OTHER",
        });

        await expect(
            service.update(ctx(), "l_1", { status: "WON" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(leadUpdate).not.toHaveBeenCalled();
    });
});

describe("LeadsService.logActivity", () => {
    beforeEach(() => jest.clearAllMocks());

    it("writes a NOTE (default type) with the actorUserId", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
        });
        activityCreate.mockResolvedValue({ id: "a_1", type: "NOTE" });

        await service.logActivity(ctx(), "l_1", { body: "Called them" });

        expect(activityCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: "org_1",
                leadId: "l_1",
                type: "NOTE",
                body: "Called them",
                actorUserId: "user_1",
            }),
        });
    });

    it("404s a cross-tenant lead and writes nothing", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_OTHER",
        });

        await expect(
            service.logActivity(ctx(), "l_1", { body: "x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(activityCreate).not.toHaveBeenCalled();
    });

    it("denies a MEMBER (activity:write) before any I/O", async () => {
        const service = makeService();
        await expect(
            service.logActivity(ctx({ role: "MEMBER" }), "l_1", { body: "x" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(leadFindUnique).not.toHaveBeenCalled();
    });
});

describe("LeadsService.createTask", () => {
    beforeEach(() => jest.clearAllMocks());

    it("writes a TASK with body, dueAt (Date) and actorUserId", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
        });
        activityCreate.mockResolvedValue({ id: "a_1", type: "TASK" });

        await service.createTask(ctx(), "l_1", {
            body: "Follow up",
            dueAt: "2026-08-01T09:00:00.000Z",
        });

        expect(activityCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                organizationId: "org_1",
                leadId: "l_1",
                type: "TASK",
                body: "Follow up",
                dueAt: new Date("2026-08-01T09:00:00.000Z"),
                actorUserId: "user_1",
            }),
        });
    });

    it("404s a cross-tenant lead and writes nothing", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_OTHER",
        });

        await expect(
            service.createTask(ctx(), "l_1", {
                body: "x",
                dueAt: "2026-08-01T09:00:00.000Z",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(activityCreate).not.toHaveBeenCalled();
    });

    it("denies a MEMBER before any I/O", async () => {
        const service = makeService();
        await expect(
            service.createTask(ctx({ role: "MEMBER" }), "l_1", {
                body: "x",
                dueAt: "2026-08-01T09:00:00.000Z",
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(leadFindUnique).not.toHaveBeenCalled();
    });
});

describe("LeadsService.completeTask", () => {
    beforeEach(() => jest.clearAllMocks());

    it("stamps completedAt on an open TASK of this lead", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
        });
        activityFindUnique.mockResolvedValue({
            id: "a_1",
            organizationId: "org_1",
            leadId: "l_1",
            type: "TASK",
            completedAt: null,
        });
        activityUpdate.mockResolvedValue({
            id: "a_1",
            completedAt: new Date(),
        });

        await service.completeTask(ctx(), "l_1", "a_1");

        expect(activityUpdate).toHaveBeenCalledWith({
            where: { id: "a_1" },
            data: { completedAt: expect.any(Date) },
        });
    });

    it("is idempotent — re-completing keeps the original completedAt and writes nothing", async () => {
        const service = makeService();
        const done = new Date("2026-07-01T00:00:00.000Z");
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
        });
        activityFindUnique.mockResolvedValue({
            id: "a_1",
            organizationId: "org_1",
            leadId: "l_1",
            type: "TASK",
            completedAt: done,
        });

        const res = await service.completeTask(ctx(), "l_1", "a_1");

        expect(res.completedAt).toBe(done);
        expect(activityUpdate).not.toHaveBeenCalled();
    });

    it("404s when the activity is a NOTE, not a TASK", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
        });
        activityFindUnique.mockResolvedValue({
            id: "a_1",
            organizationId: "org_1",
            leadId: "l_1",
            type: "NOTE",
            completedAt: null,
        });

        await expect(
            service.completeTask(ctx(), "l_1", "a_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(activityUpdate).not.toHaveBeenCalled();
    });

    it("404s when the task belongs to a different lead", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
        });
        activityFindUnique.mockResolvedValue({
            id: "a_1",
            organizationId: "org_1",
            leadId: "l_OTHER",
            type: "TASK",
            completedAt: null,
        });

        await expect(
            service.completeTask(ctx(), "l_1", "a_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(activityUpdate).not.toHaveBeenCalled();
    });

    it("404s a cross-tenant lead before touching the activity", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_OTHER",
        });

        await expect(
            service.completeTask(ctx(), "l_1", "a_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(activityFindUnique).not.toHaveBeenCalled();
    });

    it("denies a MEMBER before any I/O", async () => {
        const service = makeService();
        await expect(
            service.completeTask(ctx({ role: "MEMBER" }), "l_1", "a_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(leadFindUnique).not.toHaveBeenCalled();
    });
});

describe("LeadsService.listActivities", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns the lead's activities newest-first, org-scoped", async () => {
        const service = makeService();
        leadFindUnique.mockResolvedValue({
            id: "l_1",
            organizationId: "org_1",
        });
        activityFindMany.mockResolvedValue([]);

        await service.listActivities(ctx(), "l_1");

        expect(activityFindMany).toHaveBeenCalledWith({
            where: { leadId: "l_1", organizationId: "org_1" },
            orderBy: { createdAt: "desc" },
        });
    });

    it("denies a MEMBER (activity:read) before any I/O", async () => {
        const service = makeService();
        await expect(
            service.listActivities(ctx({ role: "MEMBER" }), "l_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(leadFindUnique).not.toHaveBeenCalled();
    });
});

describe("LeadsService.listOpenTasks", () => {
    beforeEach(() => jest.clearAllMocks());

    it("lists org's incomplete TASKs, soonest due first", async () => {
        const service = makeService();
        activityFindMany.mockResolvedValue([]);

        await service.listOpenTasks(ctx());

        expect(activityFindMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                type: "TASK",
                completedAt: null,
            },
            orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        });
    });

    it("denies a MEMBER before any I/O", async () => {
        const service = makeService();
        await expect(
            service.listOpenTasks(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(activityFindMany).not.toHaveBeenCalled();
    });
});
