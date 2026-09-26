import type { resolveActiveOrganization } from "@/lib/organizations/service";

type Org = Awaited<ReturnType<typeof resolveActiveOrganization>>;

/**
 * `store:write` — change products. The same answer the API gives; it stays
 * the authority, and refuses a write this lets through.
 */
export function canWriteProducts(organization: Org): boolean {
    return organization?.actions
        ? organization.actions.includes("store:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

/**
 * Count and move stock (`inventory:write`, which `store:write` implies,
 * #518). A stock-only role sees the Track stock switch, locked (#515).
 */
export function canStockProducts(organization: Org): boolean {
    if (canWriteProducts(organization)) return true;
    return organization?.actions?.includes("inventory:write") ?? false;
}
