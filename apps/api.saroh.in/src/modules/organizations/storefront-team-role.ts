import {
    STOREFRONT_TEAM_ACTIONS as STORED_ACTIONS,
    STOREFRONT_TEAM_ROLE_KEY,
    STOREFRONT_TEAM_ROLE_LABEL,
} from "@saroh/database";

import type { OrgAction } from "./organization-actions";
import { resolveCapabilities } from "./organization-policy";

/**
 * The "Storefront team" role (F16, DEC-048 amended 2026-09-27), as the API
 * reasons about it.
 *
 * The list and the rule that puts someone in the role live in
 * `@saroh/database` (`backfill/store-members-to-memberships.ts`), because the
 * one-off backfill runs there and cannot import the API. This file types
 * the list as the policy's actions — its spec proves each one exists and
 * that none of them reads customers, bookings or money, and of orders only
 * the kitchen's view, `order:stage` (DEC-074, narrowed to the person's
 * storefronts by `orders/order-location.ts`) — and says
 * what the role resolves to in a business, for the reach check on a
 * storefront invite.
 */
export {
    ensureStorefrontTeamRole,
    joinTeamFromStorefront,
    STOREFRONT_JOIN_AUDIT_ACTION,
} from "@saroh/database";
export { STOREFRONT_TEAM_ROLE_KEY, STOREFRONT_TEAM_ROLE_LABEL };

/** What "Storefront team" holds when a business first gets it. */
export const STOREFRONT_TEAM_ACTIONS = STORED_ACTIONS as readonly OrgAction[];

/**
 * What someone joining as Storefront team would be able to do in this
 * business: the role's own stored list if the business has it (the owner
 * may have widened it), else the list it will be made with.
 */
export function storefrontTeamCapabilities(
    stored: readonly string[] | null | undefined,
): ReadonlySet<OrgAction> {
    return resolveCapabilities(
        STOREFRONT_TEAM_ROLE_KEY,
        stored ?? STOREFRONT_TEAM_ACTIONS,
    );
}
