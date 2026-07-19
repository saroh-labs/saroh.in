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
import { CreateLeadDto, MoveLeadDto, UpdateLeadDto } from "./dto";
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
@UseGuards(BetterAuthGuard, OrganizationGuard)
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
}
