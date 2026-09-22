import type { resolveActiveOrganization } from "@/lib/organizations/service";

/** The same answer the API gives: `course:write`, or an owner or admin. */
export function canWriteCourses(
    organization: Awaited<ReturnType<typeof resolveActiveOrganization>>,
): boolean {
    return organization?.actions
        ? organization.actions.includes("course:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}
