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
import {
    CAPABILITY_GROUPS,
    grantableCapabilities,
} from "./capability-catalogue";
import { authorize } from "./organization-policy";
import { OrganizationRolesService } from "./organization-roles.service";
import { CreateRoleDto, RING_TONES, UpdateRoleDto } from "./roles.dto";

/**
 * The roles a business has, and the ones it invents.
 *
 * Reading needs `member:read` — the same floor that shows the roster, because
 * knowing what a colleague's role lets them do is part of working alongside
 * them. Writing needs `member:role:update`, the one permission the catalogue
 * warns about: whoever holds it can widen their own reach.
 *
 * Not module-gated. Roles are how a business decides who may touch what, and
 * a module switch must never be able to lock the owner out of that.
 */
@Controller("organizations/:organizationId/roles")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class OrganizationRolesController {
    constructor(private readonly roles: OrganizationRolesService) {}

    @Get()
    list(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "member:read");
        return this.roles.list(ctx.organizationId);
    }

    /**
     * What a role may be granted, grouped the way the screen shows it.
     *
     * Served rather than bundled into the frontend, for the reason the rail's
     * reach map was: two lists of permissions drift, and the drift is silent.
     */
    @Get("catalogue")
    catalogue(@OrgContext() ctx: OrganizationContext) {
        authorize(ctx, "member:read");
        return {
            groups: CAPABILITY_GROUPS,
            capabilities: grantableCapabilities(),
            ringTones: RING_TONES,
        };
    }

    @Post()
    @HttpCode(201)
    create(@OrgContext() ctx: OrganizationContext, @Body() dto: CreateRoleDto) {
        authorize(ctx, "member:role:update");
        return this.roles.create(ctx.organizationId, dto);
    }

    @Patch(":key")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("key") key: string,
        @Body() dto: UpdateRoleDto,
    ) {
        authorize(ctx, "member:role:update");
        return this.roles.update(ctx.organizationId, key, dto);
    }

    @Delete(":key")
    @HttpCode(204)
    async remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("key") key: string,
    ): Promise<void> {
        authorize(ctx, "member:role:update");
        await this.roles.remove(ctx.organizationId, key);
    }
}
