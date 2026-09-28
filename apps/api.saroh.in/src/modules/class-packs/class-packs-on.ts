import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/**
 * A business that switched Class packs off: a CLASS_PACKS row in any state
 * but ENABLED (E12, default 44). A missing row counts as on — the rule
 * Payments (`invoices/payments-on.ts`) and public booking
 * (`bookings/appointments-open.ts`) use — because the backfill may not have
 * written rows yet, and packs were sold under Appointments before.
 *
 * Read from the row itself, not through `ModuleEnforcementGuard`, so turning
 * enforcement off does not reopen sales for a business that turned packs off.
 * Turning packs off stops new sales only: packs, purchases and the classes
 * already spent all stay (DEC-016).
 */
export const CLASS_PACKS_SWITCHED_OFF = {
    moduleKey: "CLASS_PACKS",
    status: { not: "ENABLED" },
} satisfies Prisma.OrganizationModuleWhereInput;

export async function classPacksOn(
    db: Pick<Prisma.TransactionClient, "organizationModule">,
    organizationId: string,
): Promise<boolean> {
    const off = await db.organizationModule.findFirst({
        where: { organizationId, ...CLASS_PACKS_SWITCHED_OFF },
        select: { id: true },
    });
    return !off;
}

/** A 409 saying a pack can't be sold while Class packs is switched off. */
export async function assertClassPacksOn(
    db: Pick<Prisma.TransactionClient, "organizationModule">,
    organizationId: string,
): Promise<void> {
    if (await classPacksOn(db, organizationId)) return;
    throw new ConflictException(
        "Class packs is switched off, so Saroh can't sell a pack. Turn it on in Bookings › Services or Settings › Modules first.",
    );
}
