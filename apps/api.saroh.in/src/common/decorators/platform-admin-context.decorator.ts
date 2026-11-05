import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";

import type { Edition } from "@saroh/edition";

import type {
    AdminPermission,
    AdminRole,
} from "../../modules/admin/admin-permissions";

/** How the caller satisfied {@link PlatformAdminGuard}. */
export interface PlatformAdminInfo {
    userId: string;
    platformAdminId: string | null;
    roles: AdminRole[];
    permissions: AdminPermission[];
    /** True when access came from ADMIN_ALLOWLIST rather than a PlatformAdmin grant. */
    viaBootstrap: boolean;
    /** The edition this console serves, from its address; null on an address of none (local). */
    edition: Edition | null;
}

/** Injects the staff context attached by `PlatformAdminGuard`. */
export const PlatformAdminContext = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): PlatformAdminInfo => {
        return ctx
            .switchToHttp()
            .getRequest<{ platformAdmin: PlatformAdminInfo }>().platformAdmin;
    },
);
