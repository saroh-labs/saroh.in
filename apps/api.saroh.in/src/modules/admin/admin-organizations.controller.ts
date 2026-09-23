import { Body, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminLifecycleService } from "./admin-lifecycle.service";
import { AdminOrganizationViewService } from "./admin-organization-view.service";
import { AdminOrganizationsService } from "./admin-organizations.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import {
    AddNoteDto,
    ChangePlanDto,
    ConfirmedOperatorDto,
    ListOrganizationsDto,
    OpenAdminAccessSessionDto,
    OperatorReasonDto,
    RaiseLimitDto,
    RevokeAdminAccessSessionDto,
    ScheduleDeletionDto,
    SetModuleDto,
    TrialDto,
} from "./dto";
import { RequireOrganizationAccessSession } from "./organization-access-session.guard";

/**
 * Businesses on the instance (admin console U3–U5): the directory, the
 * business page behind a support-access session, and the operator actions
 * taken on one business.
 */
@AdminRoutes()
export class AdminOrganizationsController {
    constructor(
        private readonly organizations: AdminOrganizationsService,
        private readonly organizationView: AdminOrganizationViewService,
        private readonly lifecycle: AdminLifecycleService,
        private readonly access: AdminAccessService,
        private readonly adminAudit: AdminAuditService,
        private readonly idempotency: IdempotencyService,
    ) {}

    /**
     * The directory. `?for=picker` keeps the flag screen's plain id/name/slug
     * list, which the release controls still use to pick an override target.
     */
    @Get("organizations")
    @RequireAdminPermission(AdminPermission.OrganizationRead)
    listOrganizations(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: ListOrganizationsDto,
    ) {
        if (query.for === "picker") return this.organizations.picker();
        return this.organizations.directory(
            {
                q: query.q,
                lifecycle: query.lifecycle,
                planKey: query.plan,
                moduleKey: query.module,
                health: query.health,
                cursor: query.cursor,
                limit: query.limit,
            },
            {
                canReadPii: staff.permissions.includes(
                    AdminPermission.OrganizationPiiRead,
                ),
            },
        );
    }

    /** One business in the directory's shape — enough to decide to open it. */
    @Get("organizations/:organizationId/summary")
    @RequireAdminPermission(AdminPermission.OrganizationRead)
    summary(@Param("organizationId") organizationId: string) {
        return this.organizations.summary(organizationId);
    }

    /** The plans an operator can move a business to. */
    @Get("plans")
    @RequireAdminPermission(AdminPermission.SubscriptionRead)
    plans() {
        return prisma.plan.findMany({
            where: { active: true },
            select: {
                id: true,
                key: true,
                name: true,
                version: true,
                priceCents: true,
                currency: true,
                interval: true,
            },
            orderBy: [{ priceCents: "asc" }, { key: "asc" }],
        });
    }

    @Post("organizations/:organizationId/access-sessions")
    @RequireAdminPermission(AdminPermission.OrganizationViewAs)
    async openOrganizationAccess(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: OpenAdminAccessSessionDto,
    ) {
        const session = await this.access.open({
            organizationId,
            staff,
            reason: dto.reason,
            idempotencyKey: dto.idempotencyKey,
        });
        return {
            id: session.id,
            organizationId: session.organizationId,
            scope: session.scope,
            expiresAt: session.expiresAt,
        };
    }

    @Delete("organizations/:organizationId/access-sessions/:accessSessionId")
    @RequireAdminPermission(AdminPermission.OrganizationViewAs)
    async revokeOrganizationAccess(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Param("accessSessionId") accessSessionId: string,
        @Body() dto: RevokeAdminAccessSessionDto,
    ) {
        await this.access.revoke({
            sessionId: accessSessionId,
            organizationId,
            staff,
            reason: dto.reason,
            idempotencyKey: dto.idempotencyKey,
        });
        return { ok: true };
    }

    /**
     * The business page (#139, U4). Reaching it requires a session that
     * `authorize()` has just checked — right business, right staff member,
     * not revoked, not expired, not a write — and every read is recorded.
     */
    @Get("organizations/:organizationId")
    @RequireAdminPermission(AdminPermission.OrganizationViewAs)
    @RequireOrganizationAccessSession("READ")
    async viewOrganization(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
    ) {
        const view = await this.organizationView.view(organizationId, {
            canReadPii: staff.permissions.includes(
                AdminPermission.OrganizationPiiRead,
            ),
        });

        // A successful read goes through `recordRead`, which reports an audit
        // outage without failing the response. Denials take the opposite path
        // inside `authorize()` and fail the request (SEC-008).
        await this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.OrganizationViewAs,
            action: "organization.access.read",
            targetType: "organization",
            targetId: organizationId,
            organizationId,
            outcome: AdminAuditOutcome.Success,
        });

        return view;
    }

    @Post("organizations/:organizationId/suspend")
    @RequireAdminPermission(AdminPermission.OrganizationLifecycleWrite)
    suspend(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: ConfirmedOperatorDto,
    ) {
        return this.once(
            "organization.suspend",
            staff,
            organizationId,
            dto,
            () =>
                this.lifecycle.suspend({
                    staff,
                    organizationId,
                    reason: dto.reason,
                    confirmName: dto.confirmName,
                }),
        );
    }

    /** Lift a suspension or cancel a scheduled deletion. */
    @Post("organizations/:organizationId/reinstate")
    @RequireAdminPermission(AdminPermission.OrganizationLifecycleWrite)
    reinstate(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.once(
            "organization.reinstate",
            staff,
            organizationId,
            dto,
            () =>
                this.lifecycle.reinstate({
                    staff,
                    organizationId,
                    reason: dto.reason,
                }),
        );
    }

    @Post("organizations/:organizationId/schedule-deletion")
    @RequireAdminPermission(AdminPermission.OrganizationLifecycleWrite)
    scheduleDeletion(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: ScheduleDeletionDto,
    ) {
        return this.once(
            "organization.schedule-deletion",
            staff,
            organizationId,
            dto,
            () =>
                this.lifecycle.scheduleDeletion({
                    staff,
                    organizationId,
                    reason: dto.reason,
                    confirmName: dto.confirmName,
                    retentionDays: dto.retentionDays,
                }),
        );
    }

    @Put("organizations/:organizationId/plan")
    @RequireAdminPermission(AdminPermission.SubscriptionOverride)
    changePlan(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: ChangePlanDto,
    ) {
        return this.once("organization.plan", staff, organizationId, dto, () =>
            this.lifecycle.changePlan({
                staff,
                organizationId,
                reason: dto.reason,
                planId: dto.planId,
            }),
        );
    }

    @Post("organizations/:organizationId/trial")
    @RequireAdminPermission(AdminPermission.SubscriptionOverride)
    trial(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: TrialDto,
    ) {
        return this.once("organization.trial", staff, organizationId, dto, () =>
            this.lifecycle.trial({
                staff,
                organizationId,
                reason: dto.reason,
                days: dto.days,
                planId: dto.planId,
            }),
        );
    }

    @Post("organizations/:organizationId/limits")
    @RequireAdminPermission(AdminPermission.SubscriptionOverride)
    raiseLimit(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: RaiseLimitDto,
    ) {
        return this.once("organization.limit", staff, organizationId, dto, () =>
            this.lifecycle.raiseLimit({
                staff,
                organizationId,
                reason: dto.reason,
                key: dto.key,
                value: dto.value,
                days: dto.days,
            }),
        );
    }

    @Delete("organizations/:organizationId/limits/:overrideId")
    @RequireAdminPermission(AdminPermission.SubscriptionOverride)
    revokeLimit(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Param("overrideId") overrideId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.once(
            "organization.limit.revoke",
            staff,
            organizationId,
            { ...dto, overrideId },
            () =>
                this.lifecycle.revokeLimit({
                    staff,
                    organizationId,
                    reason: dto.reason,
                    overrideId,
                }),
        );
    }

    @Put("organizations/:organizationId/modules/:moduleKey")
    @RequireAdminPermission(AdminPermission.OrganizationModulesWrite)
    setModule(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Param("moduleKey") moduleKey: string,
        @Body() dto: SetModuleDto,
    ) {
        return this.once(
            "organization.module",
            staff,
            organizationId,
            { ...dto, moduleKey },
            () =>
                this.lifecycle.setModule({
                    staff,
                    organizationId,
                    reason: dto.reason,
                    moduleKey,
                    enabled: dto.enabled,
                }),
        );
    }

    @Post("organizations/:organizationId/modules/repair")
    @RequireAdminPermission(AdminPermission.OrganizationModulesWrite)
    repairModules(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.once(
            "organization.modules.repair",
            staff,
            organizationId,
            dto,
            () =>
                this.lifecycle.repairModules({
                    staff,
                    organizationId,
                    reason: dto.reason,
                }),
        );
    }

    @Post("organizations/:organizationId/notes")
    @RequireAdminPermission(AdminPermission.OrganizationViewAs)
    addNote(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: AddNoteDto,
    ) {
        return this.lifecycle.addNote(staff, organizationId, dto.body);
    }

    /**
     * Run an operator write at most once per (scope, key, operator). A retry
     * with the same key replays the first answer; the same key with a
     * different payload is a conflict, never a silent drop.
     */
    private once<T, P extends { idempotencyKey: string }>(
        scope: string,
        staff: PlatformAdminInfo,
        organizationId: string,
        payload: P,
        run: () => Promise<T>,
    ) {
        const { idempotencyKey, ...fingerprint } = payload;
        return this.idempotency.run(
            {
                scope: `admin.${scope}`,
                key: idempotencyKey,
                actorUserId: staff.userId,
                organizationId,
            },
            { organizationId, ...fingerprint },
            run,
        );
    }
}
