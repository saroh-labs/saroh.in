import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { UpdateUsageSharingDto } from "./usage-sharing.dto";
import type { UsageSharingView } from "./usage-sharing.service";
import { UsageSharingService } from "./usage-sharing.service";

/**
 * The signed-in person's "Help improve Saroh" choice (DEC-125), Settings ›
 * Your profile. Beside their alerts, and like them there is no user id in
 * the path: it is always the session's, so nobody can read or change
 * another person's. Reached through the business they are working in, as
 * every workspace call is; the choice itself is theirs in every business.
 *
 * Not module-gated: it belongs to no module.
 */
@Controller("organizations/:organizationId/me/usage-sharing")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class UsageSharingController {
    constructor(private readonly usage: UsageSharingService) {}

    @Get()
    read(@OrgContext() ctx: OrganizationContext): Promise<UsageSharingView> {
        return this.usage.read(ctx);
    }

    @Patch()
    update(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: UpdateUsageSharingDto,
    ): Promise<UsageSharingView> {
        return this.usage.update(ctx, dto);
    }
}
