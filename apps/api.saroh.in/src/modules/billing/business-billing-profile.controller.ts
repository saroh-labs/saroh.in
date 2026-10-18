import {
    Body,
    Controller,
    Get,
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
    ChooseBillingProfileDto,
    CreateBusinessBillingProfileDto,
    UpdateBillingProfileDto,
} from "./billing-profile.dto";
import type { BillingProfileView } from "./billing-profiles.service";
import type {
    BillingProfileChosen,
    BusinessBillingProfileView,
} from "./business-billing-profile.service";
import { BusinessBillingProfileService } from "./business-billing-profile.service";

/**
 * Who Saroh bills for this business, from its Plan & billing (DEC-167,
 * U5), under `/organizations/:organizationId/billing/profile`. Every route
 * here, reads included, is the owner's alone (`billing:manage`, asked in
 * the service before anything is read): an Admin reads the plan but sees
 * nothing of a billing profile (R2, AE6). Each write is named in
 * `plan-owner-only.spec.ts`.
 */
@Controller("organizations/:organizationId/billing/profile")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class BusinessBillingProfileController {
    constructor(private readonly profile: BusinessBillingProfileService) {}

    /** The profile on the business (in full only if it's the caller's), and theirs. */
    @Get()
    view(
        @OrgContext() ctx: OrganizationContext,
    ): Promise<BusinessBillingProfileView> {
        return this.profile.view(ctx);
    }

    /**
     * Bill the business to one of the caller's profiles (or keep its own):
     * at once, or from the renewal once authorised (U6, `authorise`).
     */
    @Post("choose")
    choose(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: ChooseBillingProfileDto,
    ): Promise<BillingProfileChosen> {
        return this.profile.choose(ctx, dto.billingProfileId);
    }

    /** A new profile for the caller; with `use`, the business's too. */
    @Post()
    create(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: CreateBusinessBillingProfileDto,
    ): Promise<
        BillingProfileChosen & { created: string; notMoved: string | null }
    > {
        const { use, ...input } = dto;
        return this.profile.create(ctx, input, use === true);
    }

    /** Change one of the caller's profiles; says how many businesses it bills. */
    @Patch(":profileId")
    update(
        @OrgContext() ctx: OrganizationContext,
        @Param("profileId") profileId: string,
        @Body() dto: UpdateBillingProfileDto,
    ): Promise<{ profile: BillingProfileView; businesses: number }> {
        return this.profile.update(ctx, profileId, { ...dto });
    }
}
