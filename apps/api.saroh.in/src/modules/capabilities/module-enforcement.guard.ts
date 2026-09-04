import type { CanActivate, ExecutionContext } from "@nestjs/common";
import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuthUser } from "../../common/types/store-context";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { ModuleAvailabilityService } from "./module-availability.service";
import type { ModuleKey } from "./module-registry";
import { REQUIRE_MODULE_KEY } from "./require-module.decorator";

/**
 * True when API module enforcement is switched on for this environment. Read
 * live from the environment (not the frozen typed `env`) so it is a genuine
 * runtime kill-switch — the same pattern as `RLS_ENFORCEMENT` — togglable
 * without a rebuild.
 */
export function isModuleEnforcementEnabled(): boolean {
    // eslint-disable-next-line no-restricted-properties -- runtime kill-switch; must toggle without a rebuild (mirrors RLS_ENFORCEMENT). Declared in turbo.json globalEnv.
    const v = process.env.MODULE_ENFORCEMENT;
    return v === "1" || v === "true";
}

interface GuardedRequest {
    organizationContext?: OrganizationContext;
    user?: AuthUser;
    params?: Record<string, string | undefined>;
    query?: Record<string, unknown>;
}

/**
 * Enforces effective module availability at a controller/handler boundary
 * (ADR-003 / #117). Reads the `@RequireModule(key)` metadata and, when
 * enforcement is enabled, evaluates the four gates + readiness for the resolved
 * OrganizationContext; an unavailable module is refused with the existing
 * no-existence-leak policy (UNAUTHORIZED → 404, other gate blockers → 403).
 *
 * DARK by default: with `MODULE_ENFORCEMENT` unset this guard always allows, so
 * endpoints can be annotated well ahead of the controlled flip. Requires the
 * OrganizationContext (attach OrganizationGuard first); public/webhook routes
 * carry no context and are never enforced here — their reconciliation paths
 * must keep working after a module is disabled.
 */
@Injectable()
export class ModuleEnforcementGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly availability: ModuleAvailabilityService,
        private readonly organizations: OrganizationContextService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const moduleKey = this.reflector.getAllAndOverride<
            ModuleKey | undefined
        >(REQUIRE_MODULE_KEY, [context.getHandler(), context.getClass()]);
        // Unannotated route, or enforcement dark → allow.
        if (!moduleKey || !isModuleEnforcementEnabled()) return true;

        const request = context.switchToHttp().getRequest<GuardedRequest>();
        // Store-scoped routes (`stores/:storeId/...`) carry no `:organizationId`
        // and do not run OrganizationGuard, so resolve the owning Organization
        // from the Store. Done HERE, after the dark check, rather than by adding
        // OrganizationGuard to those controllers: that guard is not dark and
        // 400s a request with no org id, which would change behaviour the moment
        // the annotation landed instead of when enforcement is switched on.
        const orgContext =
            request.organizationContext ??
            (await this.contextFromStore(request));
        // No resolved Organization (public/webhook) → not enforced here.
        if (!orgContext) return true;

        const projectId =
            request.params?.projectId ??
            (typeof request.query?.projectId === "string"
                ? request.query.projectId
                : undefined);

        const availability = await this.availability.evaluate({
            organizationId: orgContext.organizationId,
            organizationRole: orgContext.role,
            moduleKey,
            projectId,
        });

        if (availability.blockers.length === 0) return true;

        // Preserve the no-existence-leak policy: an unauthorized actor gets 404,
        // never an upsell; any other gate (rollout/module/project/entitlement)
        // is a deliberate "unavailable" 403 that reveals no flag detail.
        const codes = availability.blockers.map((b) => b.code);
        if (codes.includes("UNAUTHORIZED")) {
            throw new NotFoundException();
        }
        throw new ForbiddenException({
            error: "MODULE_UNAVAILABLE",
            moduleKey,
            blockerCodes: codes,
        });
    }

    /**
     * Resolve an Organization context from a `:storeId` route param.
     *
     * Returns null — meaning "not enforced" — rather than throwing, in three
     * cases: no store id or no authenticated user, a store that does not exist,
     * and a user with no Organization membership for the store's org. That last
     * one is the important one: a legacy StoreOwner/StoreMembers grant can still
     * authorize store access without org membership (the dual-read path in
     * StoresService), and this guard governs capability AVAILABILITY, not
     * authorization. Turning enforcement on must not silently become an
     * authorization change for un-migrated staff; the service layer still
     * decides whether they may read or write.
     */
    private async contextFromStore(
        request: GuardedRequest,
    ): Promise<OrganizationContext | null> {
        const storeId = request.params?.storeId;
        const user = request.user;
        if (!storeId || !user) return null;

        const store = await prisma.store.findFirst({
            where: { id: storeId, deletedAt: null },
            select: { organizationId: true },
        });
        if (!store?.organizationId) return null;

        try {
            return await this.organizations.resolve(
                user.id,
                store.organizationId,
            );
        } catch {
            return null;
        }
    }
}
