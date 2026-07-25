import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { OnboardOrganizationDto, UpdateOrganizationDto } from "./dto";
import { OrganizationContextService } from "./organization-context.service";
import { OrganizationOnboardingService } from "./organization-onboarding.service";
import { OrganizationSettingsService } from "./organization-settings.service";

/**
 * Organization endpoints (S1-003 / S1-004).
 *
 * `POST /organizations` onboards a new tenant with the caller as OWNER.
 * `GET /organizations` lists the caller's memberships from the session user.
 * `GET /organizations/:organizationId` demonstrates the target pattern: the
 * handler receives ONLY an authorized `OrganizationContext` (resolved by
 * `OrganizationGuard`) — it never touches the session user or a raw org id.
 */
@Controller("organizations")
export class OrganizationsController {
    constructor(
        private readonly organizations: OrganizationContextService,
        private readonly onboarding: OrganizationOnboardingService,
        private readonly settings: OrganizationSettingsService,
    ) {}

    /**
     * Onboard a new organization. Ownership is actor-derived: the OWNER is the
     * authenticated caller (`user.id`), never a value from the request body.
     */
    @Post()
    @UseGuards(BetterAuthGuard)
    onboard(
        @CurrentUser() user: AuthUser,
        @Body() dto: OnboardOrganizationDto,
    ) {
        return this.onboarding.onboard(user.id, dto);
    }

    @Get()
    @UseGuards(BetterAuthGuard)
    list(@CurrentUser() user: AuthUser) {
        return this.organizations.listForUser(user.id);
    }

    /**
     * Organizations the caller solely owns — the pre-flight for account
     * deletion. Declared BEFORE `:organizationId` so "sole-owned" is not parsed
     * as an org id. Session-scoped only; no OrganizationGuard needed.
     */
    @Get("sole-owned")
    @UseGuards(BetterAuthGuard)
    listSoleOwned(@CurrentUser() user: AuthUser) {
        return this.settings.listSoleOwned(user.id);
    }

    /**
     * The org's editable identity (name + business profile). Separate from
     * `GET :organizationId` because the profile carries legal/tax data that the
     * `org:read` floor must not expose to a MEMBER — the service enforces
     * `org:settings:read`.
     */
    @Get(":organizationId/settings")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    getSettings(@OrgContext() ctx: OrganizationContext) {
        return this.settings.get(ctx);
    }

    /**
     * Edit the org's name and/or business profile (OWNER/ADMIN). The slug is
     * immutable — see {@link UpdateOrganizationDto}.
     */
    @Patch(":organizationId")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    update(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: UpdateOrganizationDto,
    ) {
        return this.settings.update(ctx, dto);
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
