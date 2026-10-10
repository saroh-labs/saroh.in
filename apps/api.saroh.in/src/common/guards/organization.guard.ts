import {
    BadRequestException,
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { IncomingHttpHeaders } from "node:http";

import { OrganizationContextService } from "../../modules/organizations/organization-context.service";
import {
    assertWorkspaceWrite,
    isReadOnlyMethod,
} from "../../modules/organizations/organization-lifecycle.gate";
import type { LifecycleWriteClass } from "../../modules/organizations/organization-lifecycle.policy";
import { LIFECYCLE_WRITE_KEY } from "../decorators/lifecycle-write.decorator";
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
 * The lifecycle class a route declares (`@LifecycleWrite`), `new` when it
 * names none. Shared with `StoreLifecycleGuard`.
 */
export function lifecycleWriteClassOf(
    reflector: Reflector,
    context: ExecutionContext,
): LifecycleWriteClass {
    return (
        reflector.getAllAndOverride<LifecycleWriteClass | undefined>(
            LIFECYCLE_WRITE_KEY,
            [context.getHandler(), context.getClass()],
        ) ?? "new"
    );
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
 *   - `ForbiddenException` for a write the business's lifecycle refuses: a
 *     suspended business takes none, a closing one only what finishes work
 *     already started (`@LifecycleWrite("wind-down")`, DEC-117), and either
 *     lets its people download their data (`"takeout"`). Reads still pass,
 *     so its people can see what happened and take their data
 *     (`organization-lifecycle.gate.ts`).
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
    constructor(
        private readonly organizations: OrganizationContextService,
        private readonly reflector: Reflector = new Reflector(),
    ) {}

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
            await assertWorkspaceWrite(
                organizationId,
                lifecycleWriteClassOf(this.reflector, context),
            );
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
