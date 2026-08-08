import {
    Body,
    Controller,
    Delete,
    Get,
    NotFoundException,
    Param,
    Put,
    Query,
    UseGuards,
} from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { ModuleMutationDto } from "./dto";
import { ModuleAvailabilityService } from "./module-availability.service";
import { ModuleLifecycleService } from "./module-lifecycle.service";
import type { ModuleKey } from "./module-registry";
import { isModuleKey } from "./module-registry";

/**
 * Organization + Project module controls (ADR-003 / #115).
 *
 * Double-guarded — BetterAuthGuard authenticates and OrganizationGuard resolves
 * an authorized OrganizationContext. Reads require `module:read` (every role);
 * mutations require `module:manage` (enforced inside the lifecycle service).
 * The read model never leaks rollout-flag keys, entitlement internals, or
 * inaccessible Project ids. Unsafe disablement returns 409
 * MODULE_DEACTIVATION_BLOCKED with stable blocker codes.
 */
@Controller("organizations/:organizationId")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class CapabilitiesController {
    constructor(
        private readonly availability: ModuleAvailabilityService,
        private readonly lifecycle: ModuleLifecycleService,
    ) {}

    /** Catalog + effective state for every module. */
    @Get("modules")
    async list(
        @OrgContext() ctx: OrganizationContext,
        @Query("projectId") projectId?: string,
    ) {
        const data = await this.availability.listViews({
            organizationId: ctx.organizationId,
            organizationRole: ctx.role,
            projectId,
        });
        return {
            data,
            meta: { organizationId: ctx.organizationId, projectId },
        };
    }

    /** Set an Organization module's lifecycle (enable / disable / archive). */
    @Put("modules/:moduleKey")
    async setStatus(
        @OrgContext() ctx: OrganizationContext,
        @Param("moduleKey") moduleKeyParam: string,
        @Body() dto: ModuleMutationDto,
    ) {
        const moduleKey = this.moduleKey(moduleKeyParam);
        switch (dto.status) {
            case "ENABLED":
                await this.lifecycle.enable(ctx, moduleKey);
                break;
            case "DISABLED":
                await this.lifecycle.disable(ctx, moduleKey);
                break;
            case "ARCHIVED":
                await this.lifecycle.archive(ctx, moduleKey);
                break;
        }
        return { data: await this.viewOf(ctx, moduleKey) };
    }

    /** Convenience: disable an Organization module. */
    @Delete("modules/:moduleKey")
    async disable(
        @OrgContext() ctx: OrganizationContext,
        @Param("moduleKey") moduleKeyParam: string,
    ) {
        const moduleKey = this.moduleKey(moduleKeyParam);
        await this.lifecycle.disable(ctx, moduleKey);
        return { data: await this.viewOf(ctx, moduleKey) };
    }

    /** Select an enabled module for a Project. */
    @Put("projects/:projectId/modules/:moduleKey")
    async selectForProject(
        @OrgContext() ctx: OrganizationContext,
        @Param("projectId") projectId: string,
        @Param("moduleKey") moduleKeyParam: string,
    ) {
        const moduleKey = this.moduleKey(moduleKeyParam);
        await this.lifecycle.selectForProject(ctx, projectId, moduleKey);
        return { data: await this.viewOf(ctx, moduleKey, projectId) };
    }

    /** Deselect a module from a Project (Organization enablement is unchanged). */
    @Delete("projects/:projectId/modules/:moduleKey")
    async deselectForProject(
        @OrgContext() ctx: OrganizationContext,
        @Param("projectId") projectId: string,
        @Param("moduleKey") moduleKeyParam: string,
    ) {
        const moduleKey = this.moduleKey(moduleKeyParam);
        await this.lifecycle.deselectForProject(ctx, projectId, moduleKey);
        return { data: await this.viewOf(ctx, moduleKey, projectId) };
    }

    private moduleKey(param: string): ModuleKey {
        if (!isModuleKey(param)) {
            throw new NotFoundException("Unknown module");
        }
        return param;
    }

    private viewOf(
        ctx: OrganizationContext,
        moduleKey: ModuleKey,
        projectId?: string,
    ) {
        return this.availability.view({
            organizationId: ctx.organizationId,
            organizationRole: ctx.role,
            moduleKey,
            projectId,
        });
    }
}
