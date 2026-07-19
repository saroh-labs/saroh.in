import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CreatePipelineDto, CreateStageDto, UpdateStageDto } from "./dto";
import { PipelinesService } from "./pipelines.service";

/**
 * Sales Pipeline + Stage endpoints for an Organization (S3-005), scoped to
 * `/organizations/:organizationId/pipelines`.
 *
 * Double-guarded (`BetterAuthGuard` + `OrganizationGuard`); handlers receive
 * only a proven {@link OrganizationContext} via `@OrgContext()`. Reads require
 * `pipeline:read`, structural changes `pipeline:manage` — enforced in the
 * service.
 */
@Controller("organizations/:organizationId/pipelines")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class PipelinesController {
    constructor(private readonly pipelines: PipelinesService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.pipelines.list(ctx);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreatePipelineDto,
    ) {
        return this.pipelines.create(ctx, dto);
    }

    @Post(":pipelineId/stages")
    @HttpCode(201)
    addStage(
        @OrgContext() ctx: OrganizationContext,
        @Param("pipelineId") pipelineId: string,
        @Body() dto: CreateStageDto,
    ) {
        return this.pipelines.addStage(ctx, pipelineId, dto);
    }

    @Patch(":pipelineId/stages/:stageId")
    updateStage(
        @OrgContext() ctx: OrganizationContext,
        @Param("pipelineId") pipelineId: string,
        @Param("stageId") stageId: string,
        @Body() dto: UpdateStageDto,
    ) {
        return this.pipelines.updateStage(ctx, pipelineId, stageId, dto);
    }

    @Delete(":pipelineId/stages/:stageId")
    removeStage(
        @OrgContext() ctx: OrganizationContext,
        @Param("pipelineId") pipelineId: string,
        @Param("stageId") stageId: string,
    ) {
        return this.pipelines.removeStage(ctx, pipelineId, stageId);
    }
}
