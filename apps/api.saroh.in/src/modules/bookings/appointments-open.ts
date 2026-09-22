import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

/**
 * Whether an organization still takes bookings from the public, as far as the
 * Appointments module is concerned. Public booking routes carry no
 * `ModuleEnforcementGuard` (a visitor has no organization context, and the
 * guard would answer them 401/403), so they ask this instead.
 *
 * An APPOINTMENTS row in any state but ENABLED — DISABLED or ARCHIVED — means
 * the merchant switched it off. A MISSING row counts as on: enforcement ships
 * dark and the backfill may not have written rows yet, so treating "no row" as
 * off would close every booking page at once.
 *
 * The where fragments are exported so a list query (the public services list)
 * can filter with exactly the same rule.
 */
export const APPOINTMENTS_SWITCHED_OFF = {
    moduleKey: "APPOINTMENTS",
    status: { not: "ENABLED" },
} satisfies Prisma.OrganizationModuleWhereInput;

/** Organization filter: Appointments has not been switched off. */
export const APPOINTMENTS_OPEN = {
    organizationModules: { none: APPOINTMENTS_SWITCHED_OFF },
} satisfies Prisma.OrganizationWhereInput;

/** True unless the organization's APPOINTMENTS row exists and is not ENABLED. */
export async function appointmentsOpen(
    organizationId: string,
): Promise<boolean> {
    const switchedOff = await prisma.organizationModule.findFirst({
        where: { organizationId, ...APPOINTMENTS_SWITCHED_OFF },
        select: { id: true },
    });
    return !switchedOff;
}
