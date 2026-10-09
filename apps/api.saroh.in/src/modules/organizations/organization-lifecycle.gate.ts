import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    activityOpen,
    membersMayOpen,
    OrganizationLifecycleStatus,
    publicSiteOnline,
} from "./organization-lifecycle.policy";

/**
 * Whether a business may take on new activity.
 *
 * An operator can suspend a business or schedule its deletion from the admin
 * console. Either way the business keeps its data and can still read it, but
 * nothing new happens: no workspace write, no enquiry, booking or payment from
 * its public pages. Its site stays up — suspension stops activity, it does not
 * take a business offline in front of its customers. A deleted business
 * (`DELETED_RETAINED`) is also closed to its members
 * ({@link assertMembersMayOpen}) and its site is offline (#921). Which state
 * does what is `organization-lifecycle.policy.ts`.
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
    if (!organization || activityOpen(organization.lifecycleStatus)) {
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

/**
 * A member's door (#921): a deleted business can't be opened by its people.
 * Asked wherever a membership becomes access — the organization context
 * (`OrganizationContextService.resolve`) and the storefront authorizer
 * (`StoresService`) — before anything else, owners included. Staff reach a
 * business through the admin console, never a membership, so this never
 * stands in their way.
 */
export function assertMembersMayOpen(lifecycleStatus: string): void {
    if (membersMayOpen(lifecycleStatus)) return;
    throw new ForbiddenException({
        error: "ORGANIZATION_DELETED",
        status: lifecycleStatus,
        message:
            lifecycleStatus === OrganizationLifecycleStatus.DeletedRetained
                ? "This business was deleted, so it can't be opened. Its records are kept."
                : "This business can't be opened.",
    });
}

/**
 * Whether the business's public pages answer (#921): false for a deleted
 * one. A missing business is the caller's own 404 to raise, as at
 * {@link assertOrganizationOpen}. For a public read keyed by
 * something other than its site (a service); site reads filter with
 * `SITE_ONLINE_ORGANIZATION` or `PublicSiteOnlineGuard`.
 */
export async function publicSiteOnlineFor(
    organizationId: string,
): Promise<boolean> {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { lifecycleStatus: true },
    });
    return !organization || publicSiteOnline(organization.lifecycleStatus);
}

/** Methods that only read. Everything else is new activity. */
export function isReadOnlyMethod(method: string | undefined): boolean {
    return method === "GET" || method === "HEAD" || method === "OPTIONS";
}
