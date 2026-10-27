import { Get } from "@nestjs/common";

import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { AdminPermission } from "../admin/admin-permissions";
import { AdminRoutes } from "../admin/admin-routes.decorator";
import { usageLastMonths } from "./messaging-records";

/**
 * Saroh's own sender's monthly counts (messaging core), under
 * `/admin/messaging/usage`. Registered by the admin module, so the
 * console's guard stack covers it. Counts only, no business and no person,
 * so anyone who can read the console sees it (`platform:read`, as search
 * pages' list): it adds no permission.
 */
@AdminRoutes()
export class AdminMessagingUsageController {
    @Get("messaging/usage")
    @RequireAdminPermission(AdminPermission.PlatformRead)
    async usage() {
        return { months: await usageLastMonths() };
    }
}
