import type {
    CallHandler,
    ExecutionContext,
    NestInterceptor,
} from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { runInOrgContext } from "@saroh/database";
import { Observable } from "rxjs";

import type { OrganizationContext } from "../types/organization-context";

/**
 * Activates the transaction-local RLS org context for the duration of an
 * org-scoped request (the "enforcement half" of S1-011).
 *
 * `OrganizationGuard` runs before interceptors and resolves the tenant onto
 * `request.organizationContext`. This interceptor reads that org id and runs the
 * rest of the request inside `runInOrgContext(orgId, …)`, so the RLS-aware
 * `prisma` proxy (packages/database/rls-proxy) sets
 * `app.current_organization_id` on every org-scoped query's transaction. When a
 * request has no resolved org (public routes, health, Better Auth), the handler
 * runs with no context — the RLS policies' permissive branch — exactly like
 * background jobs.
 *
 * The `AsyncLocalStorage` scope must be active while the RxJS handler executes,
 * so we subscribe to the downstream stream INSIDE `runInOrgContext` (subscribing
 * outside it would run the handler after the ALS scope had already exited).
 *
 * This is a no-op unless `RLS_ENFORCEMENT` is enabled in the environment (the
 * proxy checks the flag per query), so it is safe to register unconditionally.
 */
@Injectable()
export class OrgRlsInterceptor implements NestInterceptor {
    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        const request = context.switchToHttp().getRequest<{
            organizationContext?: OrganizationContext;
        }>();
        const organizationId = request.organizationContext?.organizationId;

        if (!organizationId) {
            return next.handle();
        }

        // Subscribe to the downstream stream INSIDE the ALS scope so the handler
        // (which executes on subscription, not when `handle()` is called) and all
        // its async continuations inherit the org context. Returning
        // `runInOrgContext(id, () => next.handle())` would NOT work — the scope
        // would exit before the handler ran.
        return new Observable<unknown>((subscriber) => {
            let teardown: (() => void) | undefined;
            runInOrgContext(organizationId, () => {
                const sub = next.handle().subscribe({
                    next: (value) => subscriber.next(value),
                    error: (err) => subscriber.error(err),
                    complete: () => subscriber.complete(),
                });
                teardown = () => sub.unsubscribe();
            });
            return () => teardown?.();
        });
    }
}
