import { Controller, Get, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { OrganizationContextService } from "./organization-context.service";

/**
 * Organization endpoints (S1-003).
 *
 * `GET /organizations` lists the caller's memberships from the session user.
 * `GET /organizations/:organizationId` demonstrates the target pattern: the
 * handler receives ONLY an authorized `OrganizationContext` (resolved by
 * `OrganizationGuard`) — it never touches the session user or a raw org id.
 */
@Controller("organizations")
export class OrganizationsController {
    constructor(private readonly organizations: OrganizationContextService) {}

    @Get()
    @UseGuards(BetterAuthGuard)
    list(@CurrentUser() user: AuthUser) {
        return this.organizations.listForUser(user.id);
    }

    @Get(":organizationId")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    async getOne(@OrgContext() ctx: OrganizationContext) {
        const organization = await this.organizations.getSummary(
            ctx.organizationId,
        );
        return {
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            role: ctx.role,
            organization,
        };
    }
}
