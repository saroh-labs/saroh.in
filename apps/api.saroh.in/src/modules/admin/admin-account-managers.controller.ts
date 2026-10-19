import { Body, Delete, Get, Param, Post } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AssignManagerDto, ShareOutDto } from "./account-manager.dto";
import { AdminAccountManagersService } from "./admin-account-managers.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { OperatorReasonDto } from "./dto";

/**
 * Who looks after which business (DEC-169, admin console U25). Every route
 * needs `accounts:assign` (Support and Platform owner); the service checks
 * it again, so an Account manager is refused either way. Writes take a
 * reason and an idempotency key and are on the admin ledger. No support
 * session: a manager is Saroh's, not the business's own data.
 */
@AdminRoutes()
export class AdminAccountManagersController {
    constructor(
        private readonly managers: AdminAccountManagersService,
        private readonly idempotency: IdempotencyService,
    ) {}

    /** Who the business can be given to, fewest businesses first. */
    @Get("organizations/:organizationId/manager/candidates")
    @RequireAdminPermission(AdminPermission.AccountsAssign)
    managerCandidates(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
    ) {
        return this.managers.candidates(staff, organizationId);
    }

    /** Give the business a manager, or move it to another (ASSIGNED). */
    @Post("organizations/:organizationId/manager")
    @RequireAdminPermission(AdminPermission.AccountsAssign)
    assignManager(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: AssignManagerDto,
    ) {
        const { idempotencyKey, ...input } = dto;
        return this.idempotency.run(
            {
                scope: "admin.account-manager.assign",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            { organizationId, ...input },
            () => this.managers.assign(staff, organizationId, input),
        );
    }

    /** End the business's link, with a reason. */
    @Delete("organizations/:organizationId/manager")
    @RequireAdminPermission(AdminPermission.AccountsAssign)
    endManager(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
        @Body() dto: OperatorReasonDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.account-manager.end",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { organizationId, reason: dto.reason },
            () =>
                this.managers.end(staff, organizationId, {
                    reason: dto.reason,
                }),
        );
    }

    /** Share out evenly: businesses without a manager, fewest-first. */
    @Post("team/share-out")
    @RequireAdminPermission(AdminPermission.AccountsAssign)
    shareOut(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: ShareOutDto,
    ) {
        const { idempotencyKey, ...input } = dto;
        return this.idempotency.run(
            {
                scope: "admin.account-manager.share-out",
                key: idempotencyKey,
                actorUserId: staff.userId,
            },
            input,
            () => this.managers.shareOut(staff, input),
        );
    }
}
