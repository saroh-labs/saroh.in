import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { STOREFRONT_TEAM_ROLE_KEY } from "../organizations/storefront-team-role";

/**
 * A location's team works that location's orders (DEC-074, amends F16).
 *
 * The "Storefront team" role (`storefront-team`) holds `order:stage`: the
 * kitchen's view of an order, with no money, and moving its stage. What it
 * reaches is narrowed to the storefronts the person works on — their
 * `StoreMembers` rows, the same grant F11's staff Home narrows by. Like a
 * Reviewer's sites (`reviewerScope`), the narrowing is a `where` spread into
 * every order lookup, so it can't be forgotten by a guard:
 *
 * - a read of another location's order is a 404, as if it weren't there;
 * - a move of one (a stage, its Undo, a visit, the courier's details, a
 *   bulk move) is a 403 in words.
 *
 * Everyone else — every built-in role, and every role a business made — is
 * not narrowed: the scope is the role's, not the person's storefronts.
 * Nobody on no storefront at all sees no orders, never every one.
 */

/** What a location-scoped move says to an order at another storefront. */
export const OTHER_LOCATION_REFUSAL =
    "Your role moves only your location's orders.";

/** Whether this role's orders are narrowed to its storefronts. */
export function isLocationScoped(roleKey: string | null | undefined): boolean {
    return Boolean(roleKey) && roleKey === STOREFRONT_TEAM_ROLE_KEY;
}

/**
 * The orders this caller may see, as a `where` to spread beside the
 * organization's: every one, or those at a storefront they work on.
 */
export function orderLocationWhere(
    ctx: Pick<OrganizationContext, "roleKey" | "userId">,
): Prisma.OrderWhereInput {
    return isLocationScoped(ctx.roleKey)
        ? { store: { members: { some: { userId: ctx.userId } } } }
        : {};
}

/** The same, as SQL on the alias's order: `AND EXISTS (…)`, or nothing. */
export function orderLocationSql(
    ctx: Pick<OrganizationContext, "roleKey" | "userId"> | undefined,
    alias: string,
): Prisma.Sql {
    if (!ctx || !isLocationScoped(ctx.roleKey)) return Prisma.empty;
    return Prisma.sql` AND EXISTS (SELECT 1 FROM "StoreMembers" sm WHERE sm."storeId" = ${Prisma.raw(`${alias}."storeId"`)} AND sm."userId" = ${ctx.userId})`;
}

/**
 * Before a location-scoped caller moves orders: each is in this business
 * (else a 404, as before) and at a storefront they work on (else a 403).
 * Nothing for anyone else.
 */
export async function assertOrdersAtOwnLocation(
    ctx: Pick<OrganizationContext, "organizationId" | "roleKey" | "userId">,
    orderIds: readonly string[],
): Promise<void> {
    if (!isLocationScoped(ctx.roleKey)) return;
    const ids = [...new Set(orderIds)];
    if (ids.length === 0) return;
    const found = await prisma.order.findMany({
        where: { id: { in: ids }, organizationId: ctx.organizationId },
        select: {
            id: true,
            store: {
                select: {
                    members: {
                        where: { userId: ctx.userId },
                        select: { id: true },
                    },
                },
            },
        },
    });
    if (found.length < ids.length) {
        throw new NotFoundException("Order not found");
    }
    if (found.some((order) => order.store.members.length === 0)) {
        throw new ForbiddenException(OTHER_LOCATION_REFUSAL);
    }
}
