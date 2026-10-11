import { Get, Query } from "@nestjs/common";

import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { AdminUsageService } from "./admin-usage.service";
import { ListStorageUsageDto } from "./dto";

/**
 * What each business uses of the instance (#798): storage today. Read with
 * the directory's permission — the same names and states it already shows,
 * plus totals — so no new staff permission (DEC-039).
 */
@AdminRoutes()
export class AdminUsageController {
    constructor(private readonly usage: AdminUsageService) {}

    @Get("usage/storage")
    @RequireAdminPermission(AdminPermission.OrganizationRead)
    storage(@Query() query: ListStorageUsageDto) {
        return this.usage.storage({
            order: query.order,
            page: query.page,
            limit: query.limit,
        });
    }
}
