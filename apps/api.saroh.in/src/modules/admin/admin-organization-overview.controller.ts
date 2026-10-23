import { Get, Param } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { AdminOrganizationOverviewService } from "./admin-organization-overview.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";
import { assertMaySeeOrganization, scopeForStaff } from "./staff-scope";

/**
 * A business's Overview (admin plan U3, #991): one read for the cards and
 * the tab badges. `organization:read`, scoped to the staff member, and no
 * support session: it carries no personal data (see the service).
 */
@AdminRoutes()
export class AdminOrganizationOverviewController {
    constructor(private readonly overviews: AdminOrganizationOverviewService) {}

    @Get("organizations/:organizationId/overview")
    @RequireAdminPermission(AdminPermission.OrganizationRead)
    async overview(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("organizationId") organizationId: string,
    ) {
        await assertMaySeeOrganization(
            scopeForStaff(staff, AdminPermission.OrganizationRead),
            organizationId,
        );
        return this.overviews.overview(organizationId, {
            canReadBilling: staff.permissions.includes(
                AdminPermission.SarohBillingRead,
            ),
        });
    }
}
