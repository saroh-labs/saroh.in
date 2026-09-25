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
