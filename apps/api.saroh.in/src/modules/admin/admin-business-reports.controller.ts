import { Body, Get, Param, Post, Query } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { AdminBusinessReportsService } from "./admin-business-reports.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { ListBusinessReportsDto, MarkBusinessReportDoneDto } from "./dto";

/**
 * Customers' reports about a business (Terms rev 46; the public side is
 * `POST /public/business-reports`). Reading them is `organization:read`,
 * the reporter's email additionally `organization:pii:read` (decided in the
 * service, per caller). Marking one done needs `reports:resolve`, which
 * Support holds (DEC-121, amended 10 Oct): closing a report changes nothing
 * for the business, so it never needed the lifecycle write a suspension
 * does.
 */
@AdminRoutes()
export class AdminBusinessReportsController {
    constructor(
        private readonly reports: AdminBusinessReportsService,
        private readonly idempotency: IdempotencyService,
    ) {}

    @Get("business-reports")
    @RequireAdminPermission(AdminPermission.OrganizationRead)
    listBusinessReports(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: ListBusinessReportsDto,
    ) {
        return this.reports.list(staff, query);
    }

    @Post("business-reports/:id/done")
    @RequireAdminPermission(
        AdminPermission.OrganizationRead,
        AdminPermission.ReportsResolve,
    )
    markBusinessReportDone(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("id") id: string,
        @Body() dto: MarkBusinessReportDoneDto,
    ) {
        return this.idempotency.run(
            {
                scope: "admin.business-report.done",
                key: dto.idempotencyKey,
                actorUserId: staff.userId,
            },
            { id, reason: dto.reason },
            () => this.reports.markDone(staff, id, dto.reason),
        );
    }
}
