import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";

/** How the caller satisfied {@link PlatformAdminGuard}. */
export interface PlatformAdminInfo {
    userId: string;
    /** True when access came from ADMIN_ALLOWLIST rather than a PlatformAdmin grant. */
    viaBootstrap: boolean;
}

/** Injects the staff context attached by `PlatformAdminGuard`. */
export const PlatformAdminContext = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): PlatformAdminInfo => {
        return ctx
            .switchToHttp()
            .getRequest<{ platformAdmin: PlatformAdminInfo }>().platformAdmin;
    },
);
