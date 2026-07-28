import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AdminPermission } from "../../modules/admin/admin-permissions";
import type { PlatformAdminInfo } from "../decorators/platform-admin-context.decorator";
import { REQUIRE_ADMIN_PERMISSIONS } from "../decorators/require-admin-permission.decorator";

interface PermissionRequest {
    platformAdmin?: PlatformAdminInfo;
}

/** Enforce typed permission metadata after {@link PlatformAdminGuard}. */
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

        // `/admin/me` is deliberately identity-only: being admitted by
        // PlatformAdminGuard is the complete authorization for that endpoint.
        if (!required || required.length === 0) return true;

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
