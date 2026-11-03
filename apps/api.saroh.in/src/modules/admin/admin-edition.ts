import type { ExecutionContext } from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";

/**
 * Each console shows one edition's businesses (DEC-204 item 6). The edition is
 * the address the console's request came through, checked against the staff
 * member's grant in `PlatformAdminGuard`. Null is an address of no edition
 * (local development): no filter.
 *
 * The filters are passed in by the route, never read inside a shared helper:
 * sweeps and retention use those helpers and must keep crossing editions.
 */
export const ServedEdition = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): Edition | null =>
        ctx.switchToHttp().getRequest<{ platformAdmin: PlatformAdminInfo }>()
            .platformAdmin.edition,
);

/** For a query on `Organization`, or on a row with its own `edition`. */
export function editionWhere(edition: Edition | null) {
    return edition ? { edition } : {};
}

/** For a row with a required `organization` relation. */
export function viaBusiness(edition: Edition | null) {
    return edition ? { organization: { edition } } : {};
}

/**
 * For a row whose `organization` relation is optional: a row of no business
 * (a system job, an unmatched webhook) is the machinery's, shown on both.
 */
export function viaBusinessOrNone(edition: Edition | null) {
    return edition
        ? { OR: [{ organizationId: null }, { organization: { edition } }] }
        : {};
}

/**
 * For a row with a bare `organizationId` and no relation (`BillingAction`,
 * `BillingWebhookEvent`, `BillingRefund`, `CommissionLine`, kept so they
 * outlive the business). A row of no business shows on both.
 *
 * shortcut: reads the edition's ids on each call, fine at today's business
 * count; add the relation or a join if a list of these gets slow.
 */
export async function byBusinessIds(edition: Edition | null) {
    if (!edition) return {};
    const rows = await outsideOrgContext(() =>
        prisma.organization.findMany({
            where: { edition },
            select: { id: true },
        }),
    );
    return {
        OR: [
            { organizationId: null },
            { organizationId: { in: rows.map((row) => row.id) } },
        ],
    };
}

/**
 * For `User`: people with a business on this edition, and people with no
 * business yet, who could still set one up on either.
 */
export function peopleWhere(edition: Edition | null) {
    return edition
        ? {
              OR: [
                  { memberships: { some: { organization: { edition } } } },
                  { memberships: { none: {} } },
              ],
          }
        : {};
}
