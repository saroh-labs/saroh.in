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

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { InviteMemberDto, UpdateMemberRoleDto } from "./dto";
import { MembersService } from "./members.service";

/**
 * Store team endpoints. The caller is always the authenticated session user
 * (BetterAuthGuard → @CurrentUser); the service enforces owner-only management
 * and the email-match rule on accept.
 */
@Controller()
@UseGuards(BetterAuthGuard)
export class MembersController {
    constructor(private readonly members: MembersService) {}

    @Get("stores/:storeId/members")
    list(@CurrentUser() user: AuthUser, @Param("storeId") storeId: string) {
        return this.members.listMembers(storeId, user.id);
    }

    @Patch("stores/:storeId/members/:userId")
    updateRole(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("userId") userId: string,
        @Body() dto: UpdateMemberRoleDto,
    ) {
        return this.members.updateMemberRole(
            storeId,
            user.id,
            userId,
            dto.role,
        );
    }

    @Delete("stores/:storeId/members/:userId")
    remove(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("userId") userId: string,
    ) {
        return this.members.removeMember(storeId, user.id, userId);
    }

    @Post("stores/:storeId/invitations")
    @HttpCode(201)
    invite(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Body() dto: InviteMemberDto,
    ) {
        return this.members.createInvitation(
            storeId,
            user.id,
            dto.email,
            dto.role ?? "VIEWER",
        );
    }

    @Get("stores/:storeId/invitations")
    listInvites(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
    ) {
        return this.members.listInvitations(storeId, user.id);
    }

    @Delete("stores/:storeId/invitations/:invitationId")
    revoke(
        @CurrentUser() user: AuthUser,
        @Param("storeId") storeId: string,
        @Param("invitationId") invitationId: string,
    ) {
        return this.members.revokeInvitation(storeId, user.id, invitationId);
    }

    @Post("invitations/:token/accept")
    accept(@CurrentUser() user: AuthUser, @Param("token") token: string) {
        return this.members.acceptInvitation(token, {
            id: user.id,
            email: user.email,
        });
    }
}
