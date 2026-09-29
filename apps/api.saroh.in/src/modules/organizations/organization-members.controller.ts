import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    Patch,
    Post,
    Put,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import {
    InviteMemberDto,
    SetExtraActionsDto,
    UpdateMemberRoleDto,
} from "./members.dto";
import { OrganizationMembersService } from "./organization-members.service";
import { StorefrontTeamNoticeService } from "./storefront-team-notice.service";

/**
 * The organization roster and its invitations (#276).
 *
 * Separate from `OrganizationsController` because one route here cannot carry
 * an organization id at all: accepting an invitation happens before the caller
 * is a member, so `OrganizationGuard` would refuse them. It runs on the session
 * alone and takes its organization from the invitation.
 */
@Controller()
export class OrganizationMembersController {
    constructor(
        private readonly members: OrganizationMembersService,
        private readonly storefrontNotice: StorefrontTeamNoticeService,
    ) {}

    @Get("organizations/:organizationId/members")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    list(@OrgContext() ctx: OrganizationContext) {
        return this.members.list(ctx);
    }

    /**
     * The people the F16 backfill put on the team as Storefront team, for
     * Team's one-time notice (DEC-048). `member:role:update`.
     */
    @Get("organizations/:organizationId/storefront-team-notice")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    storefrontTeamNotice(@OrgContext() ctx: OrganizationContext) {
        return this.storefrontNotice.read(ctx);
    }

    @Post("organizations/:organizationId/storefront-team-notice/dismiss")
    @HttpCode(200)
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    dismissStorefrontTeamNotice(@OrgContext() ctx: OrganizationContext) {
        return this.storefrontNotice.dismiss(ctx);
    }

    @Get("organizations/:organizationId/invitations")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    listInvitations(@OrgContext() ctx: OrganizationContext) {
        return this.members.listInvitations(ctx);
    }

    @Post("organizations/:organizationId/invitations")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    invite(
        @OrgContext() ctx: OrganizationContext,
        @Body() dto: InviteMemberDto,
    ) {
        return this.members.invite(ctx, dto);
    }

    @Delete("organizations/:organizationId/invitations/:invitationId")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    revokeInvitation(
        @OrgContext() ctx: OrganizationContext,
        @Param("invitationId") invitationId: string,
    ) {
        return this.members.revokeInvitation(ctx, invitationId);
    }

    @Patch("organizations/:organizationId/members/:userId")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    updateRole(
        @OrgContext() ctx: OrganizationContext,
        @Param("userId") userId: string,
        @Body() dto: UpdateMemberRoleDto,
    ) {
        return this.members.updateRole(ctx, userId, dto);
    }

    /**
     * A person's extra permissions, the whole list (F17). Under
     * `member:role:update` and the reach rule; audited.
     */
    @Put("organizations/:organizationId/members/:userId/extra-actions")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    setExtraActions(
        @OrgContext() ctx: OrganizationContext,
        @Param("userId") userId: string,
        @Body() dto: SetExtraActionsDto,
    ) {
        return this.members.setExtraActions(ctx, userId, dto);
    }

    @Delete("organizations/:organizationId/members/:userId")
    @UseGuards(BetterAuthGuard, OrganizationGuard)
    remove(
        @OrgContext() ctx: OrganizationContext,
        @Param("userId") userId: string,
    ) {
        return this.members.remove(ctx, userId);
    }

    /**
     * Accept an invitation.
     *
     * Session-only: the caller is not a member yet, which is the point. The
     * path is `organization-invitations/...` rather than `invitations/...`
     * because the store-level invite accept already holds that route.
     */
    @Post("organization-invitations/:token/accept")
    @UseGuards(BetterAuthGuard)
    accept(@CurrentUser() user: AuthUser, @Param("token") token: string) {
        return this.members.accept({ id: user.id, email: user.email }, token);
    }
}
