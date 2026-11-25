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

/**
 * `service:read`: who opens Bookings › Services and a service's page. As
 * the API resolves it; without resolved actions (an older response) every
 * built-in role but Reviewer, as bookings.
 */
export function canReadServices(
    organization: Pick<Organization, "role" | "actions"> | null,
): boolean {
    if (!organization) return false;
    return organization.actions
        ? organization.actions.includes("service:read")
        : organization.role !== "REVIEWER";
}
