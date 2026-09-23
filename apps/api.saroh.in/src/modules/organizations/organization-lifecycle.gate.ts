import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

/** The states in which a business takes no new activity. */
const CLOSED_STATES: ReadonlySet<string> = new Set([
    "SUSPENDED",
    "PENDING_DELETION",
    "DELETED_RETAINED",
]);

/**
 * Whether a business may take on new activity.
 *
 * An operator can suspend a business or schedule its deletion from the admin
 * console. Either way the business keeps its data and can still read it, but
 * nothing new happens: no workspace write, no enquiry, booking or payment from
 * its public pages. Its site stays up — suspension stops activity, it does not
 * take a business offline in front of its customers.
 *
 * Read on every call, never cached, so lifting a suspension works on the very
 * next request.
 */
export async function assertOrganizationOpen(
    organizationId: string,
): Promise<void> {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { lifecycleStatus: true },
    });
    // A missing business is the caller's own 404 to raise; this gate only
    // answers "is it open".
    if (!organization || !CLOSED_STATES.has(organization.lifecycleStatus)) {
        return;
    }

    throw new ForbiddenException({
        error: "ORGANIZATION_NOT_ACTIVE",
        status: organization.lifecycleStatus,
        message:
            organization.lifecycleStatus === "SUSPENDED"
                ? "This business is suspended and cannot take new activity right now."
                : "This business is closing and cannot take new activity.",
    });
}

/** Methods that only read. Everything else is new activity. */
export function isReadOnlyMethod(method: string | undefined): boolean {
    return method === "GET" || method === "HEAD" || method === "OPTIONS";
}
