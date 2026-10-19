import { Body, Delete, Get, Param, Post, Put } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import {
    AdminPermission,
    AdminRole,
    permissionsFor,
} from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { AdminStaffInvitesService } from "./admin-staff-invites.service";
import { AdminStaffService } from "./admin-staff.service";
import {
    AmendStaffDto,
    GrantStaffDto,
    OperatorReasonDto,
    SaveStaffProfileDto,
} from "./dto";
import { InviteStaffDto } from "./staff-invite.dto";
import { taxIdFingerprint } from "./staff-profile";

/**
 * The operator's own team (admin console U2). Granting a colleague access
 * no longer means running SQL.
 */
@AdminRoutes()
export class AdminStaffController {
    constructor(
        private readonly staffService: AdminStaffService,
        private readonly invites: AdminStaffInvitesService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @Get("staff")
    @RequireAdminPermission(AdminPermission.StaffRead)
    list() {
        return this.staffService.list();
    }

    /**
     * The fixed roles and what each may do, from the repository's closed
     * vocabulary — so the screen explains a role from the same source the
     * guard enforces it from.
     */
    @Get("staff/roles")
    @RequireAdminPermission(AdminPermission.StaffRead)
    roles() {
        return roleDefinitions();
    }

    /**
     * The Team screen's list (DEC-169, admin console U17): the same people
     * as `GET staff`, each with their job, capacity, commission flag and
     * how many businesses they look after, for everyone who may see the
     * team (`team:read`: Support and Billing too, who hold no `staff:read`).
     */
    @Get("team")
    @RequireAdminPermission(AdminPermission.TeamRead)
    team() {
        return this.staffService.list();
    }

    /** What each role may do, for the Console roles tab (`team:read`). */
    @Get("team/roles")
    @RequireAdminPermission(AdminPermission.TeamRead)
    teamRoles() {
        return roleDefinitions();
    }

    /**
     * A teammate's page (DEC-169, admin console U22). The route admits
     * `accounts:read`, which every role that holds `team:read` also holds,
     * and the Account manager too; the service then opens anyone's page to
     * `team:read` and only one's own to everyone else (403 otherwise).
     */
    @Get("team/members/:platformAdminId")
    @RequireAdminPermission(AdminPermission.AccountsRead)
    member(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("platformAdminId") platformAdminId: string,
    ) {
        return this.staffService.member({ staff, platformAdminId });
    }

    @Post("staff")
    @RequireAdminPermission(AdminPermission.StaffGrant)
    grant(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: GrantStaffDto,
    ) {
        const { idempotencyKey, ...payload } = dto;
        return this.idempotency.run(
            {
                scope: "admin.staff.grant",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            payload,
            () =>
                this.staffService.grant({
                    staff,
                    email: dto.email,
                    roles: dto.roles,
                    reason: dto.reason,
                    expiresAt: dto.expiresAt
                        ? new Date(dto.expiresAt)
                        : undefined,
                    worksAs: dto.worksAs,
                    onCommission: dto.onCommission,
                }),
        );
    }

    /**
     * Make me Platform owner: the break-glass banner's one action (admin
     * console redesign U10). Records a Platform owner grant for the caller,
     * with a reason, and only while they have none on record.
     */
    @Post("staff/me/platform-owner")
    @RequireAdminPermission(AdminPermission.StaffGrant)
    claimPlatformOwner(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.staff.claim-owner",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { reason: dto.reason },
            () =>
                this.staffService.claimPlatformOwner({
                    staff,
                    reason: dto.reason,
                }),
        );
    }

    /**
     * Invites not yet accepted or withdrawn (admin console U24), each with
     * its state: waiting, or expired and ready for Resend. Never a token.
     */
    @Get("staff/invites")
    @RequireAdminPermission(AdminPermission.StaffRead)
    listInvites() {
        return this.invites.list();
    }

    /**
     * Invite someone with no Saroh account yet (R32): an email with a
     * one-time link valid for 7 days. Never for a role beyond the sender's
     * reach. Answers whether the email left, so the console can offer Resend.
     */
    @Post("staff/invites")
    @RequireAdminPermission(AdminPermission.StaffGrant)
    inviteTeammate(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: InviteStaffDto,
    ) {
        const { idempotencyKey, ...payload } = dto;
        return this.idempotency.run(
            {
                scope: "admin.staff.invite",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            payload,
            () =>
                this.invites.invite({
                    staff,
                    email: dto.email,
                    name: dto.name,
                    roles: dto.roles,
                    worksAs: dto.worksAs,
                    onCommission: dto.onCommission,
                    reason: dto.reason,
                }),
        );
    }

    /** Send it again with a new link; the old one stops working. */
    @Post("staff/invites/:inviteId/resend")
    @RequireAdminPermission(AdminPermission.StaffGrant)
    resendInvite(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("inviteId") inviteId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.staff.invite.resend",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { inviteId, reason: dto.reason },
            () => this.invites.resend({ staff, inviteId, reason: dto.reason }),
        );
    }

    /** Take an invite back before it is accepted. */
    @Delete("staff/invites/:inviteId")
    @RequireAdminPermission(AdminPermission.StaffGrant)
    withdrawInvite(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("inviteId") inviteId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.staff.invite.withdraw",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { inviteId, reason: dto.reason },
            () =>
                this.invites.withdraw({ staff, inviteId, reason: dto.reason }),
        );
    }

    @Put("staff/:platformAdminId")
    @RequireAdminPermission(AdminPermission.StaffGrant)
    amend(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("platformAdminId") platformAdminId: string,
        @Body() dto: AmendStaffDto,
    ) {
        const { idempotencyKey, ...payload } = dto;
        return this.idempotency.run(
            {
                scope: "admin.staff.amend",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            { platformAdminId, ...payload },
            () =>
                this.staffService.amend({
                    staff,
                    platformAdminId,
                    roles: dto.roles,
                    reason: dto.reason,
                    expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
                }),
        );
    }

    @Delete("staff/:platformAdminId")
    @RequireAdminPermission(AdminPermission.StaffGrant)
    revoke(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("platformAdminId") platformAdminId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.staff.revoke",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { platformAdminId, reason: dto.reason },
            () =>
                this.staffService.revoke({
                    staff,
                    platformAdminId,
                    reason: dto.reason,
                }),
        );
    }

    /**
     * A teammate's profile (DEC-169, U18). The tax id comes back only as
     * set or not, or its last 4 characters to a `team:pay` holder (that
     * read is on the ledger).
     */
    @Get("staff/:platformAdminId/profile")
    @RequireAdminPermission(AdminPermission.TeamRead)
    profile(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("platformAdminId") platformAdminId: string,
    ) {
        return this.staffService.getProfile({ staff, platformAdminId });
    }

    /**
     * Save a teammate's profile, with a reason. A tax id left out stays as
     * it is; one sent replaces it and needs `team:pay` as well.
     */
    @Put("staff/:platformAdminId/profile")
    @RequireAdminPermission(AdminPermission.TeamWrite)
    saveProfile(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("platformAdminId") platformAdminId: string,
        @Body() dto: SaveStaffProfileDto,
    ) {
        const { idempotencyKey, reason, taxId, ...profile } = dto;
        return this.idempotency.run(
            {
                scope: "admin.staff.profile.save",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            // The stored fingerprint carries a keyed digest of the tax id,
            // never the tax id or a plain hash a short value could be
            // guessed back from.
            {
                platformAdminId,
                reason,
                ...profile,
                taxId:
                    taxId === undefined ? undefined : taxIdFingerprint(taxId),
            },
            () =>
                this.staffService.saveProfile({
                    staff,
                    platformAdminId,
                    profile: { ...profile, taxId },
                    reason,
                }),
        );
    }
}

/** Every fixed role and what it may do, from the closed vocabulary. */
function roleDefinitions() {
    return Object.values(AdminRole).map((role) => ({
        role,
        permissions: permissionsFor([role]),
    }));
}
