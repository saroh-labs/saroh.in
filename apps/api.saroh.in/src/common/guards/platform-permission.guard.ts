import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AdminPermission } from "../../modules/admin/admin-permissions";
import { IDENTITY_ONLY } from "../decorators/identity-only.decorator";
import type { PlatformAdminInfo } from "../decorators/platform-admin-context.decorator";
import { REQUIRE_ADMIN_PERMISSIONS } from "../decorators/require-admin-permission.decorator";

interface PermissionRequest {
    platformAdmin?: PlatformAdminInfo;
}

/**
 * Enforce typed permission metadata after {@link PlatformAdminGuard}.
 *
 * FAIL CLOSED. A handler that declares neither `@RequireAdminPermission(...)`
 * nor `@IdentityOnly()` is denied, not allowed.
 *
 * This guard used to return `true` when no metadata was present, so the default
 * for a newly added `/admin/*` route was ungated — forget the decorator and the
 * route shipped open to any authenticated staff member. Nothing was ever
 * exposed, because every route happened to carry one, but that is a property of
 * the current code rather than a guarantee about the next commit.
 *
 * "No permission needed" is now something a route states out loud. The two
 * cases are no longer spelled the same way, so the mistake is not silent.
 */
@Injectable()
export class PlatformPermissionGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<
            readonly AdminPermission[] | undefined
        >(REQUIRE_ADMIN_PERMISSIONS, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!required || required.length === 0) {
            const identityOnly = this.reflector.getAllAndOverride<
                boolean | undefined
            >(IDENTITY_ONLY, [context.getHandler(), context.getClass()]);

            // Explicitly identity-only: admission by PlatformAdminGuard is the
            // whole authorization, and the route says so.
            if (identityOnly === true) return true;

            // Undeclared. Refuse, and name the fix — this is a wiring mistake
            // by whoever added the route, not something the caller can resolve.
            throw new ForbiddenException(
                `${context.getClass().name}.${context.getHandler().name} declares no ` +
                    `admin permission. Add @RequireAdminPermission(...) or, if admission ` +
                    `is the complete authorization, @IdentityOnly().`,
            );
        }

        const staff = context
            .switchToHttp()
            .getRequest<PermissionRequest>().platformAdmin;
        if (!staff) {
            throw new UnauthorizedException(
                "Platform administrator context required",
            );
        }

        const granted = new Set(staff.permissions);
        if (required.every((permission) => granted.has(permission))) {
            return true;
        }

        throw new ForbiddenException(
            "Platform administrator permission required",
        );
    }
}
