import {
    BadRequestException,
    Body,
    Delete,
    Get,
    Param,
    Put,
    Query,
} from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { IdentityOnly } from "../../common/decorators/identity-only.decorator";
import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { AuthUser } from "../../common/types/store-context";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import type { FlagKey } from "../feature-flags/flags";
import { isKnownFlagKey } from "../feature-flags/flags";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import { AdminFlagsService } from "./admin-flags.service";
import { AdminMetricsService } from "./admin-metrics.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import {
    ClearFlagOverrideDto,
    ExplainFlagDto,
    ListAdminAuditDto,
    SetFlagDto,
} from "./dto";

/**
 * The Saroh control plane (S1-012) — the API behind admin.saroh.in.
 *
 * Every route is guarded by `@AdminRoutes()`: authenticated, then STAFF, then
 * the route's declared permission. This controller holds identity, aggregate
 * metrics, releases and the ledger; businesses, people, staff and the
 * machinery each have their own controller beside it.
 */
@AdminRoutes()
export class AdminController {
    constructor(
        private readonly flags: FeatureFlagService,
        private readonly adminFlags: AdminFlagsService,
        private readonly metrics: AdminMetricsService,
        private readonly adminAudit: AdminAuditService,
        private readonly idempotency: IdempotencyService,
    ) {}

    /**
     * Confirm the caller is staff, per the API (the authority) rather than per
     * the admin app's own env. `viaBootstrap` lets the UI warn that access came
     * from `ADMIN_ALLOWLIST` config instead of a recorded grant.
     */
    @Get("me")
    @IdentityOnly()
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

    @Get("flags/:flagKey/history")
    @RequireAdminPermission(AdminPermission.FlagsRead)
    async history(@Param("flagKey") flagKey: string) {
        return this.flags.history(assertKnownFlag(flagKey));
    }

    /**
     * Why one business sees the value it sees for a flag (R16): the resolver's
     * own reasoning, so the answer is exactly what the code does.
     */
    @Get("flags/:flagKey/explain")
    @RequireAdminPermission(AdminPermission.FlagsRead)
    explain(@Param("flagKey") flagKey: string, @Query() query: ExplainFlagDto) {
        return this.flags.explain(
            assertKnownFlag(flagKey),
            query.organizationId,
        );
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
        // Gated by the idempotency primitive BEFORE the service's own
        // audit-key short-circuit. That short-circuit keys on actor, operation
        // and target but not the VALUE, so a retry carrying the opposite
        // `enabled` used to be dropped as a duplicate and answered 200. The
        // fingerprint below covers the payload, so that case is now a 409.
        return this.idempotency.run(
            {
                scope: "flags.global.set",
                key: dto.idempotencyKey,
                actorUserId: user.id,
            },
            { flagKey, enabled: dto.enabled, reason: dto.reason },
            async () => {
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
            },
        );
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
        return this.idempotency.run(
            {
                scope: "flags.organization.set",
                key: dto.idempotencyKey,
                actorUserId: user.id,
                organizationId,
            },
            {
                flagKey,
                organizationId,
                enabled: dto.enabled,
                reason: dto.reason,
            },
            async () => {
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
            },
        );
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
        return this.idempotency.run(
            {
                scope: "flags.organization.clear",
                key: dto.idempotencyKey,
                actorUserId: user.id,
                organizationId,
            },
            { flagKey, organizationId, reason: dto.reason },
            async () => {
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
            },
        );
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
