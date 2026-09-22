import type { Prisma } from "@saroh/database";

/**
 * A business that switched Payments off: a PAYMENTS row in any state but
 * ENABLED. A missing row counts as on — the rule public booking uses for
 * Appointments (`bookings/appointments-open.ts`) — because enforcement ships
 * dark and the backfill may not have written rows yet.
 *
 * With Payments off, nothing new is invoiced (ADR-003: disabling stops new
 * activity): renewals wait, and a pack or course is recorded without one.
 */
export const PAYMENTS_SWITCHED_OFF = {
    moduleKey: "PAYMENTS",
    status: { not: "ENABLED" },
} satisfies Prisma.OrganizationModuleWhereInput;

export async function paymentsOn(
    db: Pick<Prisma.TransactionClient, "organizationModule">,
    organizationId: string,
): Promise<boolean> {
    const off = await db.organizationModule.findFirst({
        where: { organizationId, ...PAYMENTS_SWITCHED_OFF },
        select: { id: true },
    });
    return !off;
}
