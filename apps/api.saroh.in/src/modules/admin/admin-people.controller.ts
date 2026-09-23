import { Body, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminPeopleService } from "./admin-people.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { ChangeMemberRoleDto, OperatorReasonDto, SearchPeopleDto } from "./dto";

/**
 * People across the instance (admin console U6). Every route reads or
 * changes personal data, so every route needs `organization:pii:read`, and
 * the writes need `organization:people:write` as well.
 */
@AdminRoutes()
export class AdminPeopleController {
    constructor(
        private readonly people: AdminPeopleService,
        private readonly adminAudit: AdminAuditService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @Get("people")
    @RequireAdminPermission(AdminPermission.OrganizationPiiRead)
    async search(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: SearchPeopleDto,
    ) {
        const rows = await this.people.search(query.q);
        await this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.OrganizationPiiRead,
            action: "person.search",
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
