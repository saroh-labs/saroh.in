import { applyDecorators, Controller, UseGuards } from "@nestjs/common";

import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { PlatformPermissionGuard } from "../../common/guards/platform-permission.guard";
import { OrganizationAccessSessionGuard } from "./organization-access-session.guard";

/**
 * Mount a controller under `/admin` behind the control plane's guard stack.
 *
 * Every admin controller uses this, so none can be written with a guard
 * missing or out of order: authenticated, then staff, then the route's
 * declared permission (which fails closed), then — only on routes that ask
 * for it — an open support-access session for the Organization in the path.
 */
export const AdminRoutes = () =>
    applyDecorators(
        Controller("admin"),
        UseGuards(
            BetterAuthGuard,
            PlatformAdminGuard,
            PlatformPermissionGuard,
            OrganizationAccessSessionGuard,
        ),
    );
