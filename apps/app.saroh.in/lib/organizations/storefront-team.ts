import { formatStatus } from "@/lib/format/status";

/**
 * Storefront people on the team (F16, DEC-048 amended 2026-09-27).
 *
 * Someone who joins through a storefront holds the business role
 * `storefront-team` — the API makes it, labelled "Storefront team", the
 * first time anyone joins that way. What they do inside a storefront still
 * comes from their storefront role (Admin, Manager, Editor or Viewer).
 */
export const STOREFRONT_TEAM_ROLE = "storefront-team";

/** Before the business has the role row to name it. */
export const STOREFRONT_TEAM_LABEL = "Storefront team";

/**
 * A person's storefront roles, as the line under their name on Team:
 * "Hill Road · Editor, Market · Viewer".
 */
export function storefrontRolesLine(
    storefronts: readonly { name: string; role: string }[],
): string {
    return storefronts
        .map((s) => `${s.name} · ${formatStatus(s.role)}`)
        .join(", ");
}
