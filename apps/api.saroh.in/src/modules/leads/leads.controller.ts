import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleEnforcementGuard } from "../capabilities/module-enforcement.guard";
import { RequireModule } from "../capabilities/require-module.decorator";
import {
    CreateActivityDto,
    CreateLeadDto,
    CreateTaskDto,
    MoveLeadDto,
    UpdateLeadDto,
} from "./dto";
import { LeadsService } from "./leads.service";

/**
 * CRM Lead endpoints for an Organization (S3-005), scoped to
 * `/organizations/:organizationId/leads`.
 *
 * Double-guarded (`BetterAuthGuard` + `OrganizationGuard`); handlers receive
 * only a proven {@link OrganizationContext} via `@OrgContext()`. Reads require
 * `lead:read`, writes `lead:write` — enforced in the service.
 */
@Controller("organizations/:organizationId/leads")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("CRM")
export class LeadsController {
    constructor(private readonly leads: LeadsService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query("pipelineId") pipelineId?: string,
        @Query("stageId") stageId?: string,
    ) {
        return this.leads.list(ctx, { pipelineId, stageId });
    }

    @Get(":leadId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("leadId") leadId: string,
    ) {
        return this.leads.get(ctx, leadId);
    }

    @Post()
    @HttpCode(201)
    create(@OrgContext() ctx: OrganizationContext, @Body() dto: CreateLeadDto) {
        return this.leads.create(ctx, dto);
    }

    @Patch(":leadId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("leadId") leadId: string,
        @Body() dto: UpdateLeadDto,
    ) {
        return this.leads.update(ctx, leadId, dto);
    }

    @Post(":leadId/move")
    move(
        @OrgContext() ctx: OrganizationContext,
        @Param("leadId") leadId: string,
        @Body() dto: MoveLeadDto,
    ) {
        return this.leads.move(ctx, leadId, dto);
    }

    @Get(":leadId/activities")
    listActivities(
        @OrgContext() ctx: OrganizationContext,
        @Param("leadId") leadId: string,
    ) {
        return this.leads.listActivities(ctx, leadId);
    }

    @Post(":leadId/activities")
    @HttpCode(201)
    logActivity(
        @OrgContext() ctx: OrganizationContext,
        @Param("leadId") leadId: string,
        @Body() dto: CreateActivityDto,
    ) {
        return this.leads.logActivity(ctx, leadId, dto);
    }

    @Post(":leadId/tasks")
    @HttpCode(201)
    createTask(
        @OrgContext() ctx: OrganizationContext,
        @Param("leadId") leadId: string,
        @Body() dto: CreateTaskDto,
    ) {
        return this.leads.createTask(ctx, leadId, dto);
    }

    @Post(":leadId/tasks/:activityId/complete")
    completeTask(
        @OrgContext() ctx: OrganizationContext,
        @Param("leadId") leadId: string,
        @Param("activityId") activityId: string,
    ) {
        return this.leads.completeTask(ctx, leadId, activityId);
    }
}

/**
 * Org-wide follow-up worklist (S3-007), scoped to
 * `/organizations/:organizationId/tasks`. A convenience read across leads:
 * `GET ?open=true` lists incomplete TASKs soonest-due first. Same double-guard
 * as {@link LeadsController}; reads require `activity:read`.
 */
@Controller("organizations/:organizationId/tasks")
@UseGuards(BetterAuthGuard, OrganizationGuard, ModuleEnforcementGuard)
@RequireModule("CRM")
export class TasksController {
    constructor(private readonly leads: LeadsService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext, @Query("open") open?: string) {
        // Only the open worklist is supported today; `open=true` is required.
        return open === "true" ? this.leads.listOpenTasks(ctx) : [];
    }
}
