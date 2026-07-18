import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";

import type { OrganizationContext } from "../types/organization-context";

/**
 * Injects the resolved {@link OrganizationContext} attached by
 * `OrganizationGuard`. Mirrors `@CurrentUser()`: it assumes the guard ran, so
 * only use it on routes protected by `OrganizationGuard`.
 */
export const OrgContext = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): OrganizationContext => {
        return ctx
            .switchToHttp()
            .getRequest<{ organizationContext: OrganizationContext }>()
            .organizationContext;
    },
);
