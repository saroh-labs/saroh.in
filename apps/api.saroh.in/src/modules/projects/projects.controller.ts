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
import {
    CreateProjectDto,
    GrantTeamAccessDto,
    GrantUserAccessDto,
} from "./dto";
import { ProjectAccessService } from "./project-access.service";
import { ProjectsService } from "./projects.service";

/**
 * Project + project-access endpoints, scoped to an Organization (S1-010).
 *
 * Double-guarded — `BetterAuthGuard` authenticates and `OrganizationGuard`
 * resolves an authorized `OrganizationContext`. Reads honor the OWNER/ADMIN-all
 * vs MEMBER-granted rule inside the services; mutations are gated on the
 * `project:access:manage` (grants) / `org:update` (create) OrgActions there.
 */
@Controller("organizations/:organizationId/projects")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class ProjectsController {
    constructor(
        private readonly projects: ProjectsService,
        private readonly access: ProjectAccessService,
    ) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        return this.projects.list(ctx);
    }

    @Post()
    @HttpCode(201)
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateProjectDto,
    ) {
        return this.projects.create(ctx, dto);
    }

    @Get(":projectId")
    get(
        @OrgContext() ctx: OrganizationContext,
        @Param("projectId") projectId: string,
    ) {
        return this.projects.get(ctx, projectId);
    }

    @Get(":projectId/access")
    listGrants(
        @OrgContext() ctx: OrganizationContext,
        @Param("projectId") projectId: string,
    ) {
        return this.access.listGrants(ctx, projectId);
    }

    @Post(":projectId/access/users")
    @HttpCode(201)
    grantUser(
        @OrgContext() ctx: OrganizationContext,
        @Param("projectId") projectId: string,
        @Body() dto: GrantUserAccessDto,
    ) {
        return this.access.grantToUser(ctx, projectId, dto.userId, dto.role);
    }

    @Post(":projectId/access/teams")
    @HttpCode(201)
    grantTeam(
        @OrgContext() ctx: OrganizationContext,
        @Param("projectId") projectId: string,
        @Body() dto: GrantTeamAccessDto,
    ) {
        return this.access.grantToTeam(ctx, projectId, dto.teamId, dto.role);
    }

    @Delete(":projectId/access/users/:userId")
    revokeUser(
        @OrgContext() ctx: OrganizationContext,
        @Param("projectId") projectId: string,
        @Param("userId") userId: string,
    ) {
        return this.access.revokeFromUser(ctx, projectId, userId);
    }

    @Delete(":projectId/access/teams/:teamId")
    revokeTeam(
        @OrgContext() ctx: OrganizationContext,
        @Param("projectId") projectId: string,
        @Param("teamId") teamId: string,
    ) {
        return this.access.revokeFromTeam(ctx, projectId, teamId);
    }
}
