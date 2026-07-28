import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Put,
    Query,
    UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import type { AuthUser } from "../../common/types/store-context";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { FlagKey } from "../feature-flags/flags";
import { isKnownFlagKey } from "../feature-flags/flags";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminFlagsService } from "./admin-flags.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminPermission } from "./admin-permissions";
import { ClearFlagOverrideDto, ListAdminAuditDto, SetFlagDto } from "./dto";

/**
 * The Saroh control plane (S1-012) — the API behind admin.saroh.in.
 *
 * Every route is double-guarded: authenticated, then STAFF. `PlatformAdminGuard`
 * is the only authorization in the codebase that is not tenant-scoped, so this
 * controller is the one place where a request is not answering to some
 * Organization. That is exactly why the surface is kept narrow: rollout control
 * and aggregate metrics, no tenant records.
 */
@Controller("admin")
@UseGuards(BetterAuthGuard, PlatformAdminGuard, PlatformPermissionGuard)
export class AdminController {
    constructor(
        private readonly flags: FeatureFlagService,
        private readonly adminFlags: AdminFlagsService,
        private readonly metrics: AdminMetricsService,
        private readonly adminAudit: AdminAuditService,
    ) {}

    /**
     * Confirm the caller is staff, per the API (the authority) rather than per
     * the admin app's own env. `viaBootstrap` lets the UI warn that access came
     * from `ADMIN_ALLOWLIST` config instead of a recorded grant.
     */
    @Get("me")
    me(
        @CurrentUser() user: AuthUser,
        @PlatformAdminContext() ctx: PlatformAdminInfo,
    ) {
        return {
            userId: user.id,
            email: user.email,
            roles: ctx.roles,
            permissions: ctx.permissions,
            viaBootstrap: ctx.viaBootstrap,
        };
    }

    /** Platform dashboard: aggregate counts only, never a tenant record. */
    @Get("metrics")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    getMetrics() {
        return this.metrics.summary();
    }

    /** Every registered flag with its global default and per-org overrides. */
    @Get("flags")
    @RequireAdminPermission(AdminPermission.FlagsRead)
    listFlags() {
        return this.adminFlags.list();
    }

    /** Organizations available as override targets (id/name/slug only). */
    @Get("organizations")
    @RequireAdminPermission(AdminPermission.OrganizationRead)
    listOrganizations() {
        return this.adminFlags.targetableOrganizations();
    }

    @Get("flags/:flagKey/history")
    @RequireAdminPermission(AdminPermission.FlagsRead)
    async history(@Param("flagKey") flagKey: string) {
        return this.flags.history(assertKnownFlag(flagKey));
    }

    @Get("audit")
    @RequireAdminPermission(AdminPermission.AuditRead)
    async listAudit(
        @CurrentUser() user: AuthUser,
        @Query() query: ListAdminAuditDto,
    ) {
        const page = await this.adminAudit.list(query);
        await this.adminAudit.recordRead({
            actorUserId: user.id,
            permission: AdminPermission.AuditRead,
            action: "admin.audit.read",
            targetType: "admin_audit",
            outcome: AdminAuditOutcome.Success,
            metadata: {
                filtered: Boolean(
                    query.actorUserId !== undefined ||
                    query.organizationId !== undefined ||
                    query.action !== undefined ||
                    query.cursor !== undefined,
                ),
                resultCount: page.items.length,
            },
        });
        return page;
    }

    /** Set a flag's GLOBAL default — the value every Organization inherits. */
    @Put("flags/:flagKey")
    @RequireAdminPermission(AdminPermission.FlagsPublish)
    async setGlobal(
        @CurrentUser() user: AuthUser,
        @Param("flagKey") flagKey: string,
        @Body() dto: SetFlagDto,
    ) {
        await this.flags.setGlobal(
            assertKnownFlag(flagKey),
            dto.enabled,
            user.id,
            dto.reason,
            {
                actorUserId: user.id,
                permission: AdminPermission.FlagsPublish,
                action: "flags.global.set",
                targetType: "feature_flag",
                targetId: flagKey,
                reason: dto.reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: [
                    user.id,
                    "flags.global.set",
                    flagKey,
                    dto.idempotencyKey,
                ].join(":"),
                metadata: { enabled: dto.enabled },
            },
        );
        return { ok: true };
    }

    /** Set one Organization's override — the targeted-rollout lever. */
    @Put("flags/:flagKey/organizations/:organizationId")
    @RequireAdminPermission(AdminPermission.FlagsPublish)
    async setOverride(
        @CurrentUser() user: AuthUser,
        @Param("flagKey") flagKey: string,
        @Param("organizationId") organizationId: string,
        @Body() dto: SetFlagDto,
    ) {
        await this.flags.setOverride(
            assertKnownFlag(flagKey),
            organizationId,
            dto.enabled,
            user.id,
            dto.reason,
            {
                actorUserId: user.id,
                permission: AdminPermission.FlagsPublish,
                action: "flags.organization.set",
                targetType: "feature_flag",
                targetId: flagKey,
                organizationId,
                reason: dto.reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: [
                    user.id,
                    "flags.organization.set",
                    flagKey,
                    organizationId,
                    dto.idempotencyKey,
                ].join(":"),
                metadata: { enabled: dto.enabled },
            },
        );
        return { ok: true };
    }

    /** Drop an override so the Organization follows the global default again. */
    @Delete("flags/:flagKey/organizations/:organizationId")
    @RequireAdminPermission(AdminPermission.FlagsPublish)
    async clearOverride(
        @CurrentUser() user: AuthUser,
        @Param("flagKey") flagKey: string,
        @Param("organizationId") organizationId: string,
        @Body() dto: ClearFlagOverrideDto,
    ) {
        await this.flags.clearOverride(
            assertKnownFlag(flagKey),
            organizationId,
            user.id,
            dto.reason,
            {
                actorUserId: user.id,
                permission: AdminPermission.FlagsPublish,
                action: "flags.organization.clear",
                targetType: "feature_flag",
                targetId: flagKey,
                organizationId,
                reason: dto.reason,
                outcome: AdminAuditOutcome.Success,
                idempotencyKey: [
                    user.id,
                    "flags.organization.clear",
                    flagKey,
                    organizationId,
                    dto.idempotencyKey,
                ].join(":"),
            },
        );
        return { ok: true };
    }
}

/**
 * Narrow a path segment to a registered flag key.
 *
 * Unknown keys are rejected rather than written: `FeatureFlag.key` is free text
 * in the database, so a typo would otherwise create a row that nothing ever
 * reads — a flag an operator believes they have set, silently doing nothing.
 */
function assertKnownFlag(flagKey: string): FlagKey {
    if (!isKnownFlagKey(flagKey)) {
        throw new BadRequestException(`Unknown feature flag "${flagKey}"`);
    }
    return flagKey;
}
