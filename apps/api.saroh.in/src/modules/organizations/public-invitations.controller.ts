import { Controller, Get, Param } from "@nestjs/common";

import { OrganizationMembersService } from "./organization-members.service";

/**
 * PUBLIC invitation preview, mounted at `/public/organization-invitations`
 * with NO guards — this is what someone reads before they have an account.
 *
 * It has to be public to exist at all. Accepting an invitation already runs on
 * the session alone, but SEEING one comes earlier than that: the person
 * following the link may never have used Saroh, and asking them to create an
 * account before telling them what they are joining is the thing the flow
 * design set out to fix.
 *
 * Its own controller rather than a guardless route among guarded ones, for the
 * same reason `public-payments` and `public-bookings` have theirs: a public
 * surface should be obvious in the file tree, not something you discover by
 * reading decorators.
 *
 * The service decides what is safe to return; this reads a token from the path
 * and nothing else.
 */
@Controller("public/organization-invitations")
export class PublicInvitationsController {
    constructor(private readonly members: OrganizationMembersService) {}

    @Get(":token")
    preview(@Param("token") token: string) {
        return this.members.preview(token);
    }
}
