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
export const STOREFRONT_TEAM_LABEL = "Location team";

/**
 * The name the API gives the role when it makes it. It is stored on each
 * business's role row, so an older business still holds it (DEC-069, L10).
 */
const STORED_DEFAULT_LABEL = "Storefront team";

/**
 * A role's name as a merchant reads it (DEC-069: "location", never
 * "storefront"). The stored default reads "Location team"; a name the
 * business chose itself is shown as it is. Only the words on screen change —
 * the stored label stays until the API renames it, and the role editor sends
 * a label only when someone changes it, so reading this never writes it.
 */
export function shownRoleLabel(label: string): string;
export function shownRoleLabel(
    label: string | null | undefined,
): string | null | undefined;
export function shownRoleLabel(
    label: string | null | undefined,
): string | null | undefined {
    return label === STORED_DEFAULT_LABEL ? STOREFRONT_TEAM_LABEL : label;
}

/**
 * Whether this role works only its own storefronts' orders (DEC-074): the
 * API narrows the orders it reads and moves, and the rail offers Sell with
 * Orders alone.
 */
export function isLocationScopedRole(
    roleKey: string | null | undefined,
): boolean {
    return roleKey === STOREFRONT_TEAM_ROLE;
}

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
