import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { CreateTeamDto, TeamMemberDto } from "./dto";
import { ProjectAccessService } from "./project-access.service";

/**
 * Team management endpoints, scoped to an Organization (S1-010). Teams group
 * org Members so Project access can be granted in bulk. Every mutation is
 * OWNER/ADMIN-only (`project:access:manage`), enforced in the service.
 */
@Controller("organizations/:organizationId/teams")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class TeamsController {
    constructor(private readonly access: ProjectAccessService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.access.listTeams(ctx);
    }

    @Post()
    @HttpCode(201)
    create(@OrgContext() ctx: OrganizationContext, @Body() dto: CreateTeamDto) {
        return this.access.createTeam(ctx, dto.name);
    }

    @Delete(":teamId")
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("teamId") teamId: string,
    ) {
        return this.access.deleteTeam(ctx, teamId);
    }

    @Post(":teamId/members")
    @HttpCode(201)
    addMember(
        @OrgContext() ctx: OrganizationContext,
        @Param("teamId") teamId: string,
        @Body() dto: TeamMemberDto,
    ) {
        return this.access.addTeamMember(ctx, teamId, dto.userId);
    }

    @Delete(":teamId/members/:userId")
    removeMember(
        @OrgContext() ctx: OrganizationContext,
        @Param("teamId") teamId: string,
        @Param("userId") userId: string,
    ) {
        return this.access.removeTeamMember(ctx, teamId, userId);
    }
}
