import { Get, Query } from "@nestjs/common";
import type { Edition } from "@saroh/edition";

import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { ServedEdition } from "./admin-edition";
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
    storage(
        @Query() query: ListStorageUsageDto,
        @ServedEdition() edition: Edition | null,
    ) {
        return this.usage.storage(
            {
                order: query.order,
                page: query.page,
                limit: query.limit,
            },
            edition,
        );
    }
}
