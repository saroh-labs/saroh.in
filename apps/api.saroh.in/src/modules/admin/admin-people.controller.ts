import { Body, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPeopleService } from "./admin-people.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { AdminSignInHelpService } from "./admin-sign-in-help.service";
import {
    ChangeMemberRoleDto,
    ChangeSignInEmailDto,
    OperatorReasonDto,
    SearchPeopleDto,
} from "./dto";

/**
 * People across the instance (admin console U6; Users, U9). Every route
 * reads or changes personal data, so every route needs
 * `organization:pii:read`. A change to someone's place in a business needs
 * `organization:people:write` as well; sign-in help (a code, Mark verified,
 * a changed sign-in email and its second confirmer) needs
 * `people:sign-in-help`, which Platform owners and Support hold.
 */
@AdminRoutes()
export class AdminPeopleController {
    constructor(
        private readonly people: AdminPeopleService,
        private readonly adminAudit: AdminAuditService,
        private readonly idempotency: IdempotencyService,
        private readonly signInHelp: AdminSignInHelpService,
    ) {}

    @Get("people")
    @RequireAdminPermission(AdminPermission.OrganizationPiiRead)
    async search(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: SearchPeopleDto,
    ) {
        const rows = await this.people.search({
            q: query.q,
            filters: query.filter,
        });
        await this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.OrganizationPiiRead,
            action: "person.search",
            targetType: "user",
            outcome: AdminAuditOutcome.Success,
            metadata: {
                resultCount: rows.length,
                searched: Boolean(query.q),
                filters: query.filter ?? [],
            },
        });
        return rows;
    }

    /**
     * "Newest sign-ups": the last accounts created. The same personal data
     * as a search, so the same permission, and each opening is recorded the
     * same way. Declared before `people/:userId` so "recent" is never read
     * as an id.
     */
    @Get("people/recent")
    @RequireAdminPermission(AdminPermission.OrganizationPiiRead)
    async recent(@PlatformAdminContext() staff: PlatformAdminInfo) {
        const rows = await this.people.recent();
        await this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.OrganizationPiiRead,
            action: "person.signups.list",
            targetType: "user",
            outcome: AdminAuditOutcome.Success,
            metadata: { resultCount: rows.length },
        });
        return rows;
    }

    @Get("people/:userId")
    @RequireAdminPermission(AdminPermission.OrganizationPiiRead)
    async detail(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("userId") userId: string,
    ) {
        const person = await this.people.detail(userId);
        await this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.OrganizationPiiRead,
            action: "person.read",
            targetType: "user",
            targetId: userId,
            outcome: AdminAuditOutcome.Success,
        });
        return person;
    }

    /** The History tab: what staff did to this person, newest first. */
    @Get("people/:userId/history")
    @RequireAdminPermission(AdminPermission.OrganizationPiiRead)
    async history(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("userId") userId: string,
    ) {
        const rows = await this.people.history(userId);
        await this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.OrganizationPiiRead,
            action: "person.history.read",
            targetType: "user",
            targetId: userId,
            outcome: AdminAuditOutcome.Success,
        });
        return rows;
    }

    /** Send a sign-in code through Better Auth; rate limited (U9). */
    @Post("people/:userId/sign-in-code")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.PeopleSignInHelp,
    )
    sendSignInCode(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("userId") userId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.person.sign-in-code",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { userId, reason: dto.reason },
            () => this.signInHelp.sendCode(staff, userId, dto.reason),
        );
    }

    /** Mark their email verified, as staff's word, never theirs (U9). */
    @Post("people/:userId/mark-verified")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.PeopleSignInHelp,
    )
    markVerified(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("userId") userId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.person.mark-verified",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { userId, reason: dto.reason },
            () => this.signInHelp.markVerified(staff, userId, dto.reason),
        );
    }

    /** Change their sign-in email, with the takeover safeguards (U9). */
    @Put("people/:userId/email")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.PeopleSignInHelp,
    )
    changeEmail(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("userId") userId: string,
        @Body() dto: ChangeSignInEmailDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.person.sign-in-email",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { userId, email: dto.email, reason: dto.reason },
            () =>
                this.signInHelp.changeEmail({
                    staff,
                    userId,
                    email: dto.email,
                    reason: dto.reason,
                }),
        );
    }

    /** A second, different staff member releases a held change (U9). */
    @Post("people/:userId/email/confirm")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.PeopleSignInHelp,
    )
    confirmEmail(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("userId") userId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.person.sign-in-email.confirm",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { userId, reason: dto.reason },
            () => this.signInHelp.confirmEmailChange(staff, userId, dto.reason),
        );
    }

    @Post("people/:userId/end-sessions")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.OrganizationPeopleWrite,
    )
    endSessions(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("userId") userId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.person.end-sessions",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { userId, reason: dto.reason },
            () => this.people.endSessions(staff, userId, dto.reason),
        );
    }

    @Put("organizations/:organizationId/members/:userId/role")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.OrganizationPeopleWrite,
    )
    changeRole(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Param("userId") userId: string,
        @Body() dto: ChangeMemberRoleDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.person.role",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
                organizationId,
            },
            { organizationId, userId, role: dto.role, reason: dto.reason },
            () =>
                this.people.changeRole({
                    staff,
                    organizationId,
                    userId,
                    role: dto.role,
                    reason: dto.reason,
                }),
        );
    }

    @Delete("organizations/:organizationId/members/:userId")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.OrganizationPeopleWrite,
    )
    removeMember(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Param("userId") userId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.person.remove",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
                organizationId,
            },
            { organizationId, userId, reason: dto.reason },
            () =>
                this.people.removeMember({
                    staff,
                    organizationId,
                    userId,
                    reason: dto.reason,
                }),
        );
    }

    @Post("organizations/:organizationId/invitations/:invitationId/resend")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.OrganizationPeopleWrite,
    )
    resendInvitation(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Param("invitationId") invitationId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.invitation.resend",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
                organizationId,
            },
            { organizationId, invitationId, reason: dto.reason },
            () =>
                this.people.resendInvitation({
                    staff,
                    organizationId,
                    invitationId,
                    reason: dto.reason,
                }),
        );
    }

    @Delete("organizations/:organizationId/invitations/:invitationId")
    @RequireAdminPermission(
        AdminPermission.OrganizationPiiRead,
        AdminPermission.OrganizationPeopleWrite,
    )
    withdrawInvitation(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Param("invitationId") invitationId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.invitation.withdraw",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
                organizationId,
            },
            { organizationId, invitationId, reason: dto.reason },
            () =>
                this.people.withdrawInvitation({
                    staff,
                    organizationId,
                    invitationId,
                    reason: dto.reason,
                }),
        );
    }
}
