// DB-free unit tests: the database package is mocked so nothing touches a real
// Postgres.
jest.mock("@saroh/database", () => {
    return {
        prisma: {
            pipeline: {
                findMany: jest.fn(),
                findFirst: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
            },
            stage: {
                findFirst: jest.fn(),
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                delete: jest.fn(),
            },
            lead: {
                count: jest.fn(),
            },
        },
    };
});

import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PipelinesService } from "./pipelines.service";

const pipelineFindMany = prisma.pipeline.findMany as jest.Mock;
const pipelineFindFirst = prisma.pipeline.findFirst as jest.Mock;
const pipelineFindUnique = prisma.pipeline.findUnique as jest.Mock;
const pipelineCreate = prisma.pipeline.create as jest.Mock;
const stageFindUnique = prisma.stage.findUnique as jest.Mock;
const stageCreate = prisma.stage.create as jest.Mock;
const stageUpdate = prisma.stage.update as jest.Mock;
const stageDelete = prisma.stage.delete as jest.Mock;
const leadCount = prisma.lead.count as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

describe("PipelinesService.list", () => {
    beforeEach(() => jest.clearAllMocks());

    it("scopes to the ctx org with ordered stages", async () => {
        const service = new PipelinesService();
        pipelineFindMany.mockResolvedValue([]);

        await service.list(ctx());

        expect(pipelineFindMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            orderBy: { createdAt: "desc" },
            include: { stages: { orderBy: { order: "asc" } } },
        });
    });

    it("denies a MEMBER before any I/O", async () => {
        const service = new PipelinesService();
        await expect(
            service.list(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(pipelineFindMany).not.toHaveBeenCalled();
    });
});

describe("PipelinesService.create", () => {
    beforeEach(() => jest.clearAllMocks());

    it("creates the pipeline with the supplied stages, ordered by position", async () => {
        const service = new PipelinesService();
        pipelineCreate.mockResolvedValue({ id: "p_1", stages: [] });

        await service.create(ctx(), {
            name: "Sales",
            stages: [{ name: "New" }, { name: "Won" }],
        });

        expect(pipelineCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: "org_1",
                    name: "Sales",
                    stages: {
                        create: [
                            { organizationId: "org_1", name: "New", order: 0 },
                            { organizationId: "org_1", name: "Won", order: 1 },
                        ],
                    },
                }),
            }),
        );
    });

    it("falls back to the default stage set when none are supplied", async () => {
        const service = new PipelinesService();
        pipelineCreate.mockResolvedValue({ id: "p_1", stages: [] });

        await service.create(ctx(), { name: "Sales" });

        const created = pipelineCreate.mock.calls[0][0].data.stages.create;
        expect(created).toHaveLength(5);
        expect(created[0]).toMatchObject({ name: "New", order: 0 });
        expect(created[4]).toMatchObject({ name: "Lost", order: 4 });
    });

    it("denies a MEMBER before any I/O", async () => {
        const service = new PipelinesService();
        await expect(
            service.create(ctx({ role: "MEMBER" }), { name: "Sales" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(pipelineCreate).not.toHaveBeenCalled();
    });
});

describe("PipelinesService.updateStage", () => {
    beforeEach(() => jest.clearAllMocks());

    it("renames a stage owned by the org + pipeline", async () => {
        const service = new PipelinesService();
        stageFindUnique.mockResolvedValue({
            id: "s_1",
            organizationId: "org_1",
            pipelineId: "p_1",
        });
        stageUpdate.mockResolvedValue({ id: "s_1" });

        await service.updateStage(ctx(), "p_1", "s_1", { name: "Renamed" });

        expect(stageUpdate).toHaveBeenCalledWith({
            where: { id: "s_1" },
            data: { name: "Renamed" },
        });
    });

    it("404s a stage that belongs to a different pipeline", async () => {
        const service = new PipelinesService();
        stageFindUnique.mockResolvedValue({
            id: "s_1",
            organizationId: "org_1",
            pipelineId: "p_OTHER",
        });

        await expect(
            service.updateStage(ctx(), "p_1", "s_1", { name: "x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(stageUpdate).not.toHaveBeenCalled();
    });

    it("404s a cross-tenant stage", async () => {
        const service = new PipelinesService();
        stageFindUnique.mockResolvedValue({
            id: "s_1",
            organizationId: "org_OTHER",
            pipelineId: "p_1",
        });

        await expect(
            service.updateStage(ctx(), "p_1", "s_1", { name: "x" }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe("PipelinesService.removeStage", () => {
    beforeEach(() => jest.clearAllMocks());

    it("deletes an empty stage", async () => {
        const service = new PipelinesService();
        stageFindUnique.mockResolvedValue({
            id: "s_1",
            organizationId: "org_1",
            pipelineId: "p_1",
        });
        leadCount.mockResolvedValue(0);
        stageDelete.mockResolvedValue({ id: "s_1" });

        const res = await service.removeStage(ctx(), "p_1", "s_1");

        expect(stageDelete).toHaveBeenCalledWith({ where: { id: "s_1" } });
        expect(res).toEqual({ id: "s_1", deleted: true });
    });

    it("409s a stage that still holds leads and deletes nothing", async () => {
        const service = new PipelinesService();
        stageFindUnique.mockResolvedValue({
            id: "s_1",
            organizationId: "org_1",
            pipelineId: "p_1",
        });
        leadCount.mockResolvedValue(3);

        await expect(
            service.removeStage(ctx(), "p_1", "s_1"),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(stageDelete).not.toHaveBeenCalled();
    });
});

describe("PipelinesService.addStage", () => {
    beforeEach(() => jest.clearAllMocks());

    it("appends at max-order + 1 when order is omitted", async () => {
        const service = new PipelinesService();
        pipelineFindUnique.mockResolvedValue({
            id: "p_1",
            organizationId: "org_1",
        });
        (prisma.stage.findFirst as jest.Mock).mockResolvedValue({ order: 4 });
        stageCreate.mockResolvedValue({ id: "s_new" });

        await service.addStage(ctx(), "p_1", { name: "Extra" });

        expect(stageCreate).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                pipelineId: "p_1",
                name: "Extra",
                order: 5,
            },
        });
    });
});

describe("PipelinesService.ensureDefault", () => {
    beforeEach(() => jest.clearAllMocks());

    it("returns the existing default pipeline when one exists", async () => {
        const service = new PipelinesService();
        pipelineFindFirst.mockResolvedValue({ id: "p_def", stages: [] });

        const res = await service.ensureDefault("org_1");

        expect(res.id).toBe("p_def");
        expect(pipelineCreate).not.toHaveBeenCalled();
    });

    it("creates a Sales default with New→Lost when none exists", async () => {
        const service = new PipelinesService();
        pipelineFindFirst.mockResolvedValue(null);
        pipelineCreate.mockResolvedValue({ id: "p_new", stages: [] });

        await service.ensureDefault("org_1");

        const data = pipelineCreate.mock.calls[0][0].data;
        expect(data).toMatchObject({ name: "Sales", isDefault: true });
        expect(data.stages.create).toHaveLength(5);
    });
});
