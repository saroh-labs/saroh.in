import { prisma } from "@saroh/database";

import { overLimit } from "../billing/over-limit.service";
import { memberPaused } from "../billing/paused-errors";

/**
 * A team member past the plan's limit after a move to a lower plan (#800)
 * can't open the business: 403 `MEMBER_PAUSED`, in words that say why and
 * that nothing is lost. Every way a membership is turned into access asks
 * this first — the organization context (`OrganizationGuard`, and the
 * module gate's store-scoped context) and the storefront authorizer
 * (`StoresService`) — so a paused person never reaches a generic denial,
 * nor slips through a route that never builds the context.
 *
 * The owner is never paused, so the read is skipped for them; `pausedNow`
 * is cached per business and pauses nothing when enforcement is off or the
 * plan can't be read. Operators never reach here: their access isn't a
 * membership.
 */
export async function assertMemberNotPaused(
    organizationId: string,
    membership: { id: string; role: string },
): Promise<void> {
    if (membership.role === "OWNER") return;
    const paused = await overLimit.pausedNow(organizationId);
    if (!paused?.memberIds.has(membership.id)) return;
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true },
    });
    throw memberPaused(organization?.name ?? "this business");
}
