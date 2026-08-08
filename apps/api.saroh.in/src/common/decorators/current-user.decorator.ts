import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";

import type { AuthUser } from "../types/store-context";

/** Injects the Better Auth session user attached by BetterAuthGuard. */
export const CurrentUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthUser => {
        return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
    },
);
