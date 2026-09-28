import type { resolveActiveOrganization } from "@/lib/organizations/service";

type Org = Awaited<ReturnType<typeof resolveActiveOrganization>>;

/** The same answer the API gives: `pack:read`, or an owner or admin. */
export function canReadPacks(organization: Org): boolean {
    return organization?.actions
        ? organization.actions.includes("pack:read")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

/** `pack:write` — make, change, sell and spend packs. */
export function canWritePacks(organization: Org): boolean {
    return organization?.actions
        ? organization.actions.includes("pack:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

/**
 * Sell at the desk: `pack:sell` once E26 adds it, which `pack:write`
 * implies; until then `pack:write`, as the API asks.
 */
export function canSellPacks(organization: Org): boolean {
    return organization?.actions
        ? organization.actions.includes("pack:sell") ||
              organization.actions.includes("pack:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}
