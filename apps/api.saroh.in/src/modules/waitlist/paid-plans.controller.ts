import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { WaitlistService } from "./waitlist.service";

/**
 * "Tell me when" from Plan and billing on an edition with no Saroh billing
 * (Global launch plan KTD8). The address is the signed-in person's own,
 * never one from the body (the route reads no body at all), and the edition
 * is the business's. The answer says nothing about whether they were
 * already on the list.
 */
@Controller("organizations/:organizationId/paid-plans-interest")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class PaidPlansInterestController {
    constructor(private readonly waitlist: WaitlistService) {}

    @Post()
    @HttpCode(200)
    async tellMeWhen(
        @OrgContext() ctx: OrganizationContext,
        @CurrentUser() user: AuthUser,
    ): Promise<{ ok: true }> {
        await this.waitlist.tellMeWhen({
            email: user.email,
            edition: ctx.edition ?? "INDIA",
        });
        return { ok: true };
    }
}
