import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { InviteTokenDto } from "./dto";
import type { InviteCheck, LaunchOfferGranted } from "./launch-offer.service";
import { LaunchOfferService } from "./launch-offer.service";

/**
 * An opening-day invite, as onboarding reads it (marketing plan U31). Signed
 * in, no business yet: what the invite would give this account, or why it
 * can't. The token travels in the body, so it stays out of access logs.
 */
@Controller("waitlist/invite")
@UseGuards(BetterAuthGuard)
export class WaitlistInviteController {
    constructor(private readonly offers: LaunchOfferService) {}

    @Post("check")
    @HttpCode(200)
    check(
        @CurrentUser() user: AuthUser,
        @Body() dto: InviteTokenDto,
    ): Promise<InviteCheck> {
        return this.offers.check(user, dto.token);
    }
}

/**
 * Take an invite's launch offer for the business onboarding just made (U31):
 * the waitlist entry is marked joined and the business goes on the offer
 * plan for the offer's length. `billing:manage`, which its Owner has.
 */
@Controller("organizations/:organizationId/launch-offer")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class LaunchOfferController {
    constructor(private readonly offers: LaunchOfferService) {}

    @Post()
    @HttpCode(200)
    redeem(
        @OrgContext() ctx: OrganizationContext,
        @CurrentUser() user: AuthUser,
        @Body() dto: InviteTokenDto,
    ): Promise<LaunchOfferGranted> {
        return this.offers.redeem(ctx, user, dto.token);
    }
}
