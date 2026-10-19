import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import {
    CreateAccountBillingProfileDto,
    UpdateBillingProfileDto,
} from "./billing-profile.dto";
import type {
    AccountProfileDetail,
    AccountProfileView,
    OwnedBusiness,
    ProfileSyncState,
} from "./billing-profiles-account.service";
import { BillingProfilesAccountService } from "./billing-profiles-account.service";
import type { BillingProfileChosen } from "./business-billing-profile.service";

/**
 * The signed-in person's own billing profiles (DEC-167), with no business
 * in the way: setting up a business asks who Saroh bills for it before the
 * business exists (R7), and accounts.saroh.in's Billing profiles (step 2,
 * #1015) lists, changes, adds, moves businesses between and removes them.
 * Session-scoped: every route is filtered by the signed-in user in the
 * service, and a business named in the path must be one they own (an
 * OWNER membership), else a 404. Profiles as one business uses them are
 * its Plan & billing's (`business-billing-profile.controller.ts`).
 */
@Controller("billing-profiles")
@UseGuards(BetterAuthGuard)
export class BillingProfilesController {
    constructor(private readonly profiles: BillingProfilesAccountService) {}

    /** The caller's profiles, each with the businesses it pays for. */
    @Get()
    listMine(@CurrentUser() user: AuthUser): Promise<AccountProfileView[]> {
        return this.profiles.list(user.id);
    }

    /** Every business the caller owns, wherever it is billed. */
    @Get("businesses")
    businesses(@CurrentUser() user: AuthUser): Promise<OwnedBusiness[]> {
        return this.profiles.ownedBusinesses(user.id);
    }

    /** One of the caller's profiles, with its recent invoices (`invoices=all`: all). */
    @Get(":id")
    detail(
        @CurrentUser() user: AuthUser,
        @Param("id") id: string,
        @Query("invoices") invoices?: string,
    ): Promise<AccountProfileDetail> {
        return this.profiles.detail(user.id, id, invoices === "all");
    }

    /** A new profile; with `organizationId`, that business moves to it. */
    @Post()
    create(
        @CurrentUser() user: AuthUser,
        @Body() dto: CreateAccountBillingProfileDto,
    ): Promise<{
        profile: AccountProfileDetail;
        moved: BillingProfileChosen["outcome"] | null;
        notMoved: string | null;
    }> {
        const { organizationId, ...input } = dto;
        return this.profiles.create(user.id, input, organizationId);
    }

    /** Change one of the caller's profiles; says how many businesses it bills. */
    @Patch(":id")
    update(
        @CurrentUser() user: AuthUser,
        @Param("id") id: string,
        @Body() dto: UpdateBillingProfileDto,
    ): Promise<{ profile: AccountProfileDetail; businesses: number }> {
        return this.profiles.update(user.id, id, { ...dto });
    }

    /** Bill one of the caller's businesses to this profile. */
    @Post(":id/businesses/:organizationId")
    @HttpCode(200)
    move(
        @CurrentUser() user: AuthUser,
        @Param("id") id: string,
        @Param("organizationId") organizationId: string,
    ): Promise<BillingProfileChosen> {
        return this.profiles.move(user.id, id, organizationId);
    }

    /** Give up a move waiting for authorisation away from this profile. */
    @Delete(":id/businesses/:organizationId/pending")
    cancelPending(
        @CurrentUser() user: AuthUser,
        @Param("id") id: string,
        @Param("organizationId") organizationId: string,
    ): Promise<BillingProfileChosen> {
        return this.profiles.cancelPending(user.id, id, organizationId);
    }

    /** Remove a profile nothing points at. */
    @Delete(":id")
    remove(
        @CurrentUser() user: AuthUser,
        @Param("id") id: string,
    ): Promise<{ removed: true }> {
        return this.profiles.remove(user.id, id);
    }

    /** Ask the billing provider again. */
    @Post(":id/sync")
    @HttpCode(200)
    sync(
        @CurrentUser() user: AuthUser,
        @Param("id") id: string,
    ): Promise<{ sync: ProfileSyncState; queued: boolean }> {
        return this.profiles.retrySync(user.id, id);
    }
}
