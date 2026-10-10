import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { LifecycleWriteClass } from "./organization-lifecycle.policy";
import {
    lifecycleAllows,
    membersMayOpen,
    OrganizationLifecycleStatus,
    publicSiteOnline,
} from "./organization-lifecycle.policy";

/**
 * What a customer is told when a business isn't taking anything new for a
 * lifecycle reason (DEC-117): the paused words of #800,
 * never why. A customer never learns that a business is suspended or
 * closing.
 */
export const NOT_TAKING_NEW_MESSAGE =
    "This business isn't taking new orders, bookings or enquiries right now.";

async function lifecycleOf(organizationId: string): Promise<string | null> {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { lifecycleStatus: true },
    });
    return organization?.lifecycleStatus ?? null;
}

/** The refusal a customer gets: the same for every state, naming none. */
function notTakingNew(): ForbiddenException {
    return new ForbiddenException({
        error: "ORGANIZATION_NOT_ACTIVE",
        message: NOT_TAKING_NEW_MESSAGE,
    });
}

/**
 * Whether a business may take on new activity from its public pages.
 *
 * An operator can suspend a business or schedule its deletion from the admin
 * console. Either way the business keeps its data and can still read it, but
 * nothing new happens: no enquiry, booking or payment for something new from
 * its public pages. Its site stays up — suspension stops activity, it does
 * not take a business offline in front of its customers — and says it isn't
 * taking orders or bookings right now, as a paused site does (#800,
 * `orders/checkout-paused.ts`). A deleted business (`DELETED_RETAINED`) is
 * also closed to its members ({@link assertMembersMayOpen}) and its site is
 * offline (#921). Which state does what is `organization-lifecycle.policy.ts`.
 *
 * The refusal names no state: a customer is never told a business is
 * suspended or closing (DEC-117).
 *
 * Read on every call, never cached, so lifting a suspension works on the very
 * next request.
 */
export async function assertOrganizationOpen(
    organizationId: string,
): Promise<void> {
    const status = await lifecycleOf(organizationId);
    // A missing business is the caller's own 404 to raise; this gate only
    // answers "is it open".
    if (status === null || lifecycleAllows(status, "new")) return;
    throw notTakingNew();
}

/**
 * A customer finishing something already started (DEC-117): paying an order
 * or invoice the business already sent them, or signing in to see what they
 * have. Open while the business is open or winding down
 * (`PENDING_DELETION`); refused, in the same words as
 * {@link assertOrganizationOpen}, while it is suspended or deleted.
 */
export async function assertOrganizationWindingDown(
    organizationId: string,
): Promise<void> {
    const status = await lifecycleOf(organizationId);
    if (status === null || lifecycleAllows(status, "wind-down")) return;
    throw notTakingNew();
}

/** The words a member hears when the lifecycle refuses a write. */
export function workspaceRefusalMessage(
    status: string,
    writeClass: LifecycleWriteClass,
): string {
    if (status === OrganizationLifecycleStatus.Suspended) {
        return "This business is suspended and cannot take new activity right now.";
    }
    if (status === OrganizationLifecycleStatus.PendingDeletion) {
        return writeClass === "new"
            ? "This business is closing, so nothing new can start. You can still finish, cancel and refund the orders and bookings already made, and download your data."
            : "This business is closing and can't do this now.";
    }
    return "This business can't do this now.";
}

/**
 * A write in the workspace, by its lifecycle class (DEC-117): `new` only
 * while the business is open, `wind-down` while it is open or closing, and
 * `takeout` whenever its members may open it. Asked by `OrganizationGuard`
 * and `StoreLifecycleGuard` with the route's `@LifecycleWrite` class
 * (`new` when it names none).
 */
export async function assertWorkspaceWrite(
    organizationId: string,
    writeClass: LifecycleWriteClass,
): Promise<void> {
    const status = await lifecycleOf(organizationId);
    if (status === null || lifecycleAllows(status, writeClass)) return;
    throw new ForbiddenException({
        error: "ORGANIZATION_NOT_ACTIVE",
        status,
        writeClass,
        message: workspaceRefusalMessage(status, writeClass),
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
