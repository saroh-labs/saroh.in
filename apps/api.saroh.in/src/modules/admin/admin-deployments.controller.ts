import { Body, Get, Post } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminDeploymentsService } from "./admin-deployments.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { StartDeploymentDto } from "./dto";

/**
 * Deployments (#886, DEC-107): each Cloudflare app's latest run per
 * environment, and starting one. Platform Owners only: `deployments:run` is
 * on no other role.
 */
@AdminRoutes()
export class AdminDeploymentsController {
    constructor(
        private readonly deployments: AdminDeploymentsService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @Get("deployments")
    @RequireAdminPermission(AdminPermission.DeploymentsRun)
    list() {
        return this.deployments.list();
    }

    /**
     * Start one app's deploy in one environment. A double press, or a retry
     * after a dropped response, carries the same key and starts one run.
     */
    @Post("deployments")
    @RequireAdminPermission(AdminPermission.DeploymentsRun)
    start(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Body() dto: StartDeploymentDto,
    ) {
        return this.idempotency.run(
            {
                scope: "deployment.start",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            {
                app: dto.app,
                environment: dto.environment,
                confirm: dto.confirm,
                reason: dto.reason,
            },
            () =>
                this.deployments.start(staff, {
                    app: dto.app,
                    environment: dto.environment,
                    confirm: dto.confirm,
                    reason: dto.reason,
                }),
        );
    }
}
