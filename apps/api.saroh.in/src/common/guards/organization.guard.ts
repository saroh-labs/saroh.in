import {
    BadRequestException,
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import type { IncomingHttpHeaders } from "node:http";

import { OrganizationContextService } from "../../modules/organizations/organization-context.service";
import type { OrganizationContext } from "../types/organization-context";
import type { AuthUser } from "../types/store-context";

interface OrganizationRequest {
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
