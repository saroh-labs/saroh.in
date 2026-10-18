import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import type { AuthUser } from "../../common/types/store-context";
import { AdminStaffInvitesService } from "../admin/admin-staff-invites.service";
import { StaffInviteTokenDto } from "../admin/staff-invite.dto";

/**
 * Reading a staff invite before there is an account to read it with (admin
 * console U24), mounted at `/public/staff-invites` with no guards: whoever
 * follows the link may have no Saroh account yet. accounts.saroh.in's
 * server calls it with the token from its httpOnly cookie, in the body so
 * the token never sits in a path an access log keeps. Every invite that
 * can't be shown is the same 404.
 *
 * A POST that writes nothing. The token is 32 random bytes, so walking
 * tokens finds nothing.
 */
@Controller("public/staff-invites")
export class PublicStaffInvitesController {
    constructor(private readonly invites: AdminStaffInvitesService) {}

    @Post("preview")
    @HttpCode(200)
    preview(@Body() dto: StaffInviteTokenDto) {
        return this.invites.preview(dto.token);
    }
}

/**
 * Accepting a staff invite (admin console U24). On the session alone, not
 * behind the admin guards: the caller is not staff yet, which is the point.
 * The service checks the session's own verified email against the invite's
 * and the sender's reach again before anything is granted.
 */
@Controller("staff-invites")
@UseGuards(BetterAuthGuard)
export class StaffInviteAcceptController {
    constructor(private readonly invites: AdminStaffInvitesService) {}

    @Post("accept")
    @HttpCode(200)
    accept(@CurrentUser() user: AuthUser, @Body() dto: StaffInviteTokenDto) {
        return this.invites.accept({ id: user.id }, dto.token);
    }
}
