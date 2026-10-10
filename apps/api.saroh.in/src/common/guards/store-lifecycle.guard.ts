import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { prisma } from "@saroh/database";

import {
    assertWorkspaceWrite,
    isReadOnlyMethod,
} from "../../modules/organizations/organization-lifecycle.gate";
import type { AuthUser } from "../types/store-context";
import { lifecycleWriteClassOf } from "./organization.guard";

interface StoreRequest {
    method?: string;
    params?: Record<string, string | undefined>;
    user?: AuthUser;
}

/**
 * The lifecycle's say on a storefront's writes (DEC-117).
 *
 * Store-scoped routes (`stores/:storeId/…`) carry no `:organizationId`
 * and don't run `OrganizationGuard`, so before this a suspended or closing
 * business still took a New order, a product or a storefront invite
 * through them. This guard finds the store's business and asks the same
 * question `OrganizationGuard` asks — the route's `@LifecycleWrite` class,
 * `new` when it names none — on every write. Reads pass untouched.
 *
 * Only someone who works there hears the business's state: a membership,
 * or a storefront owner or member row. Anyone else is let through to the
 * service, whose own access check answers them as before, so a stranger
 * learns nothing. A store id the route doesn't carry, or a store that
 * doesn't exist, is the service's own 404.
 *
 * `paramName` is the route's store parameter: `storeId` on every
 * storefront controller, `id` on `PUT stores/:id`.
 */
export function storeLifecycleGuard(paramName: "storeId" | "id" = "storeId") {
    @Injectable()
    class StoreLifecycleGuard implements CanActivate {
        constructor(readonly reflector: Reflector) {}

        async canActivate(context: ExecutionContext): Promise<boolean> {
            const request = context.switchToHttp().getRequest<StoreRequest>();
            if (isReadOnlyMethod(request.method)) return true;
            const storeId = request.params?.[paramName];
            const userId = request.user?.id;
            if (!storeId || !userId) return true;

            const store = await prisma.store.findFirst({
                where: { id: storeId },
                select: { organizationId: true },
            });
            if (!store) return true;
            if (!(await worksThere(userId, storeId, store.organizationId))) {
                return true;
            }
            await assertWorkspaceWrite(
                store.organizationId,
                lifecycleWriteClassOf(this.reflector, context),
            );
            return true;
        }
    }
    return StoreLifecycleGuard;
}

/** The guard for `stores/:storeId/…` controllers. */
export const StoreLifecycleGuard = storeLifecycleGuard("storeId");

async function worksThere(
    userId: string,
    storeId: string,
    organizationId: string,
): Promise<boolean> {
    const [membership, owner, member] = await Promise.all([
        prisma.membership.findFirst({
            where: { userId, organizationId },
            select: { id: true },
        }),
        prisma.storeOwner.findFirst({
            where: { userId, storeId },
            select: { id: true },
        }),
        prisma.storeMembers.findFirst({
            where: { userId, storeId },
            select: { id: true },
        }),
    ]);
    return Boolean(membership ?? owner ?? member);
}
