import { SetMetadata } from "@nestjs/common";

import type { AdminPermission } from "../../modules/admin/admin-permissions";

export const REQUIRE_ADMIN_PERMISSIONS = "admin:required-permissions";

/** Declare every control-plane permission required by a handler or controller. */
export const RequireAdminPermission = (
    ...permissions: readonly AdminPermission[]
) => SetMetadata(REQUIRE_ADMIN_PERMISSIONS, permissions);
