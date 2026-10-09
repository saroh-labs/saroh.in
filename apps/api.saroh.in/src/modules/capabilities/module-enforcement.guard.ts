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
import { isMemberPaused } from "../billing/paused-errors";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { ModuleAvailabilityService } from "./module-availability.service";
import { logModuleEnforcement } from "./module-enforcement.log";
import type { ModuleKey } from "./module-registry";
import {
    IGNORE_MODULE_READINESS_KEY,
    REQUIRE_MODULE_KEY,
} from "./require-module.decorator";

/**
 * How `ModuleEnforcementGuard` runs in this environment, read live from
 * `MODULE_ENFORCEMENT` (not the frozen typed `env`) so it is a genuine
 * runtime kill-switch — the same pattern as `RLS_ENFORCEMENT` — togglable
 * without a rebuild.
 *
 * - `off` (unset, or any other value): every request passes, with no lookup
 *   and no log — zero cost.
 * - `shadow`: every request passes, but an annotated one is evaluated, and
 *   one that would have been refused logs `module_enforcement_would_refuse`
 *   (the runbook's Shadow step).
 * - `on` (`1`/`true`): an unavailable module is refused, and the refusal
 *   logs `module_enforcement_refused`.
 */
export type ModuleEnforcementMode = "off" | "shadow" | "on";

export function moduleEnforcementMode(): ModuleEnforcementMode {
    // eslint-disable-next-line no-restricted-properties -- runtime kill-switch; must toggle without a rebuild (mirrors RLS_ENFORCEMENT). Declared in turbo.json globalEnv.
    const v = process.env.MODULE_ENFORCEMENT;
    if (v === "1" || v === "true") return "on";
    if (v === "shadow") return "shadow";
    return "off";
}

/** True when the guard actually refuses (`MODULE_ENFORCEMENT` on). */
export function isModuleEnforcementEnabled(): boolean {
    return moduleEnforcementMode() === "on";
}

interface GuardedRequest {
    method?: string;
    route?: { path?: unknown };
    organizationContext?: OrganizationContext;
    user?: AuthUser;
    params?: Record<string, string | undefined>;
    query?: Record<string, unknown>;
}

/** What the guard would refuse a request with, and what to log about it. */
interface Refusal {
    error: NotFoundException | ForbiddenException;
    status: 403 | 404;
    org: string;
    blockers: string[];
}

/**
 * Enforces effective module availability at a controller/handler boundary
 * (ADR-003 / #117). Reads the `@RequireModule(key)` metadata and, when
 * enforcement is enabled, evaluates the four gates + readiness for the resolved
 * OrganizationContext; an unavailable module is refused with the existing
 * no-existence-leak policy (UNAUTHORIZED → 404, other gate blockers → 403).
 *
 * DARK by default: with `MODULE_ENFORCEMENT` unset this guard always allows, so
 * endpoints can be annotated well ahead of the controlled flip. In `shadow`
 * it still allows, and logs what it would have refused
 * (`module-enforcement.log.ts`). Requires the OrganizationContext (attach
 * OrganizationGuard first); public/webhook routes carry no context and are
 * never enforced here — their reconciliation paths must keep working after a
 * module is disabled.
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
        // Unannotated route, or enforcement dark → allow, with no lookup.
        if (!moduleKey) return true;
        const mode = moduleEnforcementMode();
        if (mode === "off") return true;

        if (mode === "shadow") {
            // Shadow never changes an answer: whatever it finds, or fails to
            // find, the request goes on exactly as with enforcement off.
            try {
                const refusal = await this.refusal(context, moduleKey);
                if (refusal) {
                    logModuleEnforcement("module_enforcement_would_refuse", {
                        module: moduleKey,
                        route: routeOf(context),
                        org: refusal.org,
                        blockers: refusal.blockers,
                        status: refusal.status,
                    });
                }
            } catch (err) {
                // A paused member is answered by the service as before; it
                // is not a module question.
                if (!isMemberPaused(err)) {
                    logModuleEnforcement("module_enforcement_shadow_failed", {
                        module: moduleKey,
                        route: routeOf(context),
                    });
                }
            }
            return true;
        }

        const refusal = await this.refusal(context, moduleKey);
        if (!refusal) return true;
        logModuleEnforcement("module_enforcement_refused", {
            module: moduleKey,
            route: routeOf(context),
            org: refusal.org,
            blockers: refusal.blockers,
            status: refusal.status,
        });
        throw refusal.error;
    }

    /** What enforcement would answer this request with; null to let it pass. */
    private async refusal(
        context: ExecutionContext,
        moduleKey: ModuleKey,
    ): Promise<Refusal | null> {
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
        if (!orgContext) return null;

        const projectId =
            request.params?.projectId ??
            (typeof request.query?.projectId === "string"
                ? request.query.projectId
                : undefined);

        const availability = await this.availability.evaluate({
            organizationId: orgContext.organizationId,
            organizationRole: orgContext.role,
            organizationActions: orgContext.actions,
            moduleKey,
            projectId,
        });

        const ignoreReadiness =
            this.reflector.getAllAndOverride<boolean | undefined>(
                IGNORE_MODULE_READINESS_KEY,
                [context.getHandler(), context.getClass()],
            ) === true;
        // A route that works before setup is finished passes once every gate
        // has — decided by availability, so a gate added there later still
        // shuts it rather than being mistaken for readiness.
        if (ignoreReadiness && availability.gatesPassed) return null;
        const blockers = availability.blockers;
        if (blockers.length === 0) return null;

        // Preserve the no-existence-leak policy: an unauthorized actor gets 404,
        // never an upsell; any other gate (rollout/module/project/entitlement)
        // is a deliberate "unavailable" 403 that reveals no flag detail.
        const codes = blockers.map((b) => b.code);
        const org = orgContext.organizationId;
        if (codes.includes("UNAUTHORIZED")) {
            return {
                error: new NotFoundException(),
                status: 404,
                org,
                blockers: codes,
            };
        }
        return {
            error: new ForbiddenException({
                error: "MODULE_UNAVAILABLE",
                moduleKey,
                blockerCodes: codes,
            }),
            status: 403,
            org,
            blockers: codes,
        };
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
        } catch (err) {
            // A team member past the plan's limit (#800) hears why, in the
            // paused words, before any module question — not "not enforced",
            // which handed them to the service's generic answer.
            if (isMemberPaused(err)) throw err;
            return null;
        }
    }
}

/**
 * The route as registered — `GET /organizations/:organizationId/orders` —
 * never the URL, which carries ids and a query string. Falls back to the
 * controller and handler names when the platform gives no template.
 */
function routeOf(context: ExecutionContext): string {
    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const path = request.route?.path;
    if (typeof path === "string" && path) {
        return `${request.method ?? ""} ${path}`.trim();
    }
    return `${context.getClass().name}.${context.getHandler().name}`;
}
