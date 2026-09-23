import {
    BadRequestException,
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import type { IncomingHttpHeaders } from "node:http";

import { OrganizationContextService } from "../../modules/organizations/organization-context.service";
import {
    assertOrganizationOpen,
    isReadOnlyMethod,
} from "../../modules/organizations/organization-lifecycle.gate";
import type { OrganizationContext } from "../types/organization-context";
import type { AuthUser } from "../types/store-context";

interface OrganizationRequest {
    method?: string;
    params?: Record<string, string | undefined>;
    headers: IncomingHttpHeaders;
    user?: AuthUser;
    organizationContext?: OrganizationContext;
}

/**
 * Resolves the target Organization for a request and attaches an authorized
 * {@link OrganizationContext} to it. Runs AFTER `BetterAuthGuard` (which sets
 * `request.user`); business handlers then receive only a proven context.
 *
 * Target org id resolution order:
 *   1. route param `:organizationId`
 *   2. `x-organization-id` request header (for non-parameterized routes)
 *
 * Throws:
 *   - `UnauthorizedException` if no authenticated user (guard misordering).
 *   - `BadRequestException`   if no organization id can be determined.
 *   - `NotFoundException` / `ForbiddenException` from the resolver otherwise.
 *   - `ForbiddenException` for a write to a business an operator suspended or
 *     scheduled for deletion. Reads still pass, so its people can see what
 *     happened and take their data (`organization-lifecycle.gate.ts`).
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
    constructor(private readonly organizations: OrganizationContextService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context
            .switchToHttp()
            .getRequest<OrganizationRequest>();

        const user = request.user;
        if (!user) {
            throw new UnauthorizedException("Authentication required");
        }

        const organizationId = resolveOrganizationId(request);
        if (!organizationId) {
            throw new BadRequestException("Missing organization id");
        }

        request.organizationContext = await this.organizations.resolve(
            user.id,
            organizationId,
        );
        // After membership: a stranger learns nothing about the business's
        // state, and a member learns why their write was refused.
        if (!isReadOnlyMethod(request.method)) {
            await assertOrganizationOpen(organizationId);
        }
        return true;
    }
}

function resolveOrganizationId(
    request: OrganizationRequest,
): string | undefined {
    const fromParam = request.params?.organizationId;
    if (typeof fromParam === "string" && fromParam.length > 0) {
        return fromParam;
    }
    const fromHeader = request.headers["x-organization-id"];
    if (typeof fromHeader === "string" && fromHeader.length > 0) {
        return fromHeader;
    }
    return undefined;
}
