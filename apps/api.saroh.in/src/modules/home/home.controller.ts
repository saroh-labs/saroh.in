import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { HomeService } from "./home.service";

/**
 * The aggregated Home read model (#119). One request → the ranked next-actions
 * for the active Organization (± Project), so the client never fans out. Double-
 * guarded; the read respects the actor's role via the availability projection.
 */
@Controller("organizations/:organizationId/home")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class HomeController {
    constructor(private readonly home: HomeService) {}

    /**
     * `?parts=rail` is the shell's read (review #16): the ranked actions
     * its badges count, without the sources only Home's page draws. Any
     * other value, or none, is the whole of Home.
     */
    @Get()
    get(
        @OrgContext() ctx: OrganizationContext,
        @Query("projectId") projectId?: string,
        @Query("parts") parts?: string,
    ) {
        const input = {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            organizationRole: ctx.role,
            organizationRoleKey: ctx.roleKey,
            organizationActions: ctx.actions,
            projectId,
        };
        return parts === "rail"
            ? this.home.rail(input)
            : this.home.build(input);
    }
}
