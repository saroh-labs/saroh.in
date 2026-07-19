import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Pipeline, Stage } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import type { CreatePipelineDto, CreateStageDto, UpdateStageDto } from "./dto";

/** A pipeline with its stages loaded in board order (0..n). */
export type PipelineWithStages = Pipeline & { stages: Stage[] };

/** The default board columns, in order (0..4) — mirrors the enquiry funnel. */
const DEFAULT_STAGES = ["New", "Contacted", "Qualified", "Won", "Lost"];

/** Include clause that loads a pipeline's stages in board order. */
const withStages = {
    stages: { orderBy: { order: "asc" as const } },
};

/**
 * Org-owned sales Pipelines + their Stages (S3-005).
 *
 * Every operation is tenant-scoped by `ctx.organizationId` (proven by
 * `OrganizationGuard`, never client-supplied) and gated by the central policy:
 * reads require `pipeline:read`, structural changes require `pipeline:manage`
 * (both OWNER/ADMIN-only). Cross-tenant or missing ids surface as a 404 (never a
 * 403), mirroring `DomainsService.requireOwned`, so a caller can't probe another
 * org's pipelines. A Stage that still holds leads cannot be deleted (409) —
 * deleting it would orphan those leads' `stageId`.
 */
@Injectable()
export class PipelinesService {
    /** The org's pipelines, each with ordered stages. Newest first. */
    async list(ctx: OrganizationContext): Promise<PipelineWithStages[]> {
        authorize(ctx, "pipeline:read");
        return prisma.pipeline.findMany({
            where: { organizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
            include: withStages,
        });
    }

    /**
     * Create a pipeline with its initial stages (from the DTO or the default
     * New→Lost set). Authorizes `pipeline:manage`. Stages are ordered by array
     * position; the pipeline is never left empty.
     */
    async create(
        ctx: OrganizationContext,
        dto: CreatePipelineDto,
    ): Promise<PipelineWithStages> {
        authorize(ctx, "pipeline:manage");

        const names =
            dto.stages && dto.stages.length > 0
                ? dto.stages.map((s) => s.name)
                : DEFAULT_STAGES;

        return prisma.pipeline.create({
            data: {
                organizationId: ctx.organizationId,
                name: dto.name,
                stages: {
                    create: names.map((name, order) => ({
                        organizationId: ctx.organizationId,
                        name,
                        order,
                    })),
                },
            },
            include: withStages,
        });
    }

    /**
     * Append a Stage to an owned pipeline. Authorizes `pipeline:manage`; the
     * pipeline must belong to the org (404 otherwise). Order defaults to the end
     * (max existing order + 1) when the DTO omits it.
     */
    async addStage(
        ctx: OrganizationContext,
        pipelineId: string,
        dto: CreateStageDto,
    ): Promise<Stage> {
        authorize(ctx, "pipeline:manage");

        await this.requireOwned(ctx, pipelineId);

        const order = dto.order ?? (await this.nextOrder(pipelineId));

        return prisma.stage.create({
            data: {
                organizationId: ctx.organizationId,
                pipelineId,
                name: dto.name,
                order,
            },
        });
    }

    /**
     * Rename and/or reorder a Stage of an owned pipeline. Authorizes
     * `pipeline:manage`; a missing / cross-tenant / cross-pipeline stage 404s.
     */
    async updateStage(
        ctx: OrganizationContext,
        pipelineId: string,
        stageId: string,
        dto: UpdateStageDto,
    ): Promise<Stage> {
        authorize(ctx, "pipeline:manage");

        await this.requireOwnedStage(ctx, pipelineId, stageId);

        return prisma.stage.update({
            where: { id: stageId },
            data: {
                ...(dto.name !== undefined ? { name: dto.name } : {}),
                ...(dto.order !== undefined ? { order: dto.order } : {}),
            },
        });
    }

    /**
     * Delete a Stage of an owned pipeline. Authorizes `pipeline:manage`;
     * missing / cross-tenant / cross-pipeline stage 404s. Rejects with 409 when
     * the stage still holds leads — deleting it would orphan their `stageId`, so
     * the leads must be moved first.
     */
    async removeStage(
        ctx: OrganizationContext,
        pipelineId: string,
        stageId: string,
    ): Promise<{ id: string; deleted: true }> {
        authorize(ctx, "pipeline:manage");

        await this.requireOwnedStage(ctx, pipelineId, stageId);

        const leadCount = await prisma.lead.count({ where: { stageId } });
        if (leadCount > 0) {
            throw new ConflictException(
                `Stage still has ${leadCount} lead(s); move them before deleting`,
            );
        }

        await prisma.stage.delete({ where: { id: stageId } });
        return { id: stageId, deleted: true };
    }

    /**
     * Ensure the org has a default pipeline, creating a `Sales` default (Stages
     * New→Lost at order 0..4) the first time it is needed. Not authorized here —
     * it is an internal helper used by lead creation, which has already checked
     * `lead:write`. Returns the pipeline with its ordered stages.
     */
    async ensureDefault(organizationId: string): Promise<PipelineWithStages> {
        const existing = await prisma.pipeline.findFirst({
            where: { organizationId, isDefault: true },
            include: withStages,
        });
        if (existing) return existing;

        return prisma.pipeline.create({
            data: {
                organizationId,
                name: "Sales",
                isDefault: true,
                stages: {
                    create: DEFAULT_STAGES.map((name, order) => ({
                        organizationId,
                        name,
                        order,
                    })),
                },
            },
            include: withStages,
        });
    }

    /** Next free order for a pipeline (max existing + 1, or 0 when empty). */
    private async nextOrder(pipelineId: string): Promise<number> {
        const last = await prisma.stage.findFirst({
            where: { pipelineId },
            orderBy: { order: "desc" },
        });
        return last ? last.order + 1 : 0;
    }

    /**
     * Load a pipeline and assert it belongs to `ctx.organizationId`. 404 for a
     * missing OR cross-tenant id (never a 403 — no cross-org probing).
     */
    private async requireOwned(
        ctx: OrganizationContext,
        pipelineId: string,
    ): Promise<Pipeline> {
        const pipeline = await prisma.pipeline.findUnique({
            where: { id: pipelineId },
        });
        if (pipeline?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Pipeline not found");
        }
        return pipeline;
    }

    /**
     * Load a stage and assert it belongs to `ctx.organizationId` AND to the named
     * pipeline. 404 for a missing, cross-tenant, or cross-pipeline id.
     */
    private async requireOwnedStage(
        ctx: OrganizationContext,
        pipelineId: string,
        stageId: string,
    ): Promise<Stage> {
        const stage = await prisma.stage.findUnique({
            where: { id: stageId },
        });
        if (
            stage?.organizationId !== ctx.organizationId ||
            stage.pipelineId !== pipelineId
        ) {
            throw new NotFoundException("Stage not found");
        }
        return stage;
    }
}
