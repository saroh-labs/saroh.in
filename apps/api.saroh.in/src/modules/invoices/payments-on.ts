import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/**
 * A business that switched Payments off: a PAYMENTS row in any state but
 * ENABLED. A missing row counts as on — the rule public booking uses for
 * Appointments (`bookings/appointments-open.ts`) — because enforcement ships
 * dark and the backfill may not have written rows yet.
 *
 * With Payments off, nothing is invoiced automatically (ADR-003: disabling
 * stops new activity): renewals wait (one set to end still ends), a pack or
 * course is recorded without one, and subscribing someone is refused — a
 * subscription is only its invoices.
 *
 * Invoicing by hand is not Payments' (DEC-070, amending DEC-019): a
 * business creates, issues, sends and records an invoice paid with Payments
 * off. Only taking the money online needs it (`pay-online.ts`).
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

/** A 409 naming what cannot be done while Payments is switched off. */
export async function assertPaymentsOn(
    db: Pick<Prisma.TransactionClient, "organizationModule">,
    organizationId: string,
    action: string,
): Promise<void> {
    if (await paymentsOn(db, organizationId)) return;
    throw new ConflictException(
        `Payments is switched off, so Saroh can't ${action}. Turn Payments on in Settings first.`,
    );
}
