import type { Organization } from "@/lib/organizations/service";

/**
 * `booking:read`, as the API resolves it for this person (E5). Without the
 * resolved actions (an older response), every built-in role but Reviewer
 * reads bookings (DEC-020).
 */
export function canReadBookings(
    organization: Pick<Organization, "role" | "actions"> | null,
): boolean {
    if (!organization) return true;
    return organization.actions
        ? organization.actions.includes("booking:read")
        : organization.role !== "REVIEWER";
}
