import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/**
 * A legal hold on a business (DEC-119, owner 10 Oct).
 *
 * The Terms say an account found doing something the law prohibits is
 * suspended at once and its data kept "for as long as the law requires, or
 * while it's needed to prevent, detect or investigate an offence… even if
 * deletion was requested". The hold is that promise in the product: an
 * operator sets it when suspending a business for prohibited activity (or
 * on one already suspended or on its way out), and only a Platform Owner
 * lifts it (`AdminLifecycleService`).
 *
 * It is not a lifecycle state: a held business keeps the state it is in
 * (`organization-lifecycle.policy.ts` still decides activity, billing, the
 * site and the members' door). The hold decides one more thing, the same in
 * every state: **nothing deletes or erases its data.** While
 * `Organization.legalHoldAt` is set,
 *
 * - no deletion can be scheduled, and the deletion sweep leaves it;
 * - the deletion clean-up does none of its destructive steps (pending jobs,
 *   custom hostnames, keys);
 * - the retention eraser (`organization.retention.erase`) leaves it;
 * - the retention sweeps (analytics events, security logs) leave its rows;
 * - a customer's privacy removal is refused, with the refusal on the
 *   business's history;
 * - "Download your data" is refused.
 *
 * Every job that deletes reads the hold through this module, and
 * `legal-hold.deletes.spec.ts` scans the source for deletes a job runs and
 * fails on one that is neither hold-aware nor declared not a business's
 * data.
 */

/** What a member of a held business is told. Names no reason. */
export const LEGAL_HOLD_MESSAGE =
    "This business's data is on hold. Write to contact@saroh.in.";

/** `details.code` on a refusal, and the reason an audit row records. */
export const LEGAL_HOLD_CODE = "LEGAL_HOLD";

/** `organization: NOT_ON_LEGAL_HOLD` (or spread on an Organization where). */
export const NOT_ON_LEGAL_HOLD = {
    legalHoldAt: null,
} satisfies Prisma.OrganizationWhereInput;

type HoldReader = Pick<Prisma.TransactionClient, "organization">;

/** Is this business on legal hold? A business that doesn't exist isn't. */
export async function onLegalHold(
    db: HoldReader,
    organizationId: string,
): Promise<boolean> {
    const organization = await db.organization.findUnique({
        where: { id: organizationId },
        select: { legalHoldAt: true },
    });
    return organization?.legalHoldAt != null;
}

/**
 * The same, with the business's row locked `FOR SHARE` until the
 * transaction ends: placing a hold updates that row, so it waits for a
 * destructive write that is already under way and every write after it
 * sees the hold. For a transaction that erases.
 */
export async function onLegalHoldLocked(
    tx: Prisma.TransactionClient,
    organizationId: string,
): Promise<boolean> {
    const rows = await tx.$queryRaw<{ legalHoldAt: Date | null }[]>`
        SELECT "legalHoldAt" FROM "Organization"
        WHERE id = ${organizationId}
        FOR SHARE`;
    return rows[0]?.legalHoldAt != null;
}

/** The ids, of these businesses, that are on legal hold. */
export async function heldAmong(
    db: HoldReader,
    organizationIds: readonly string[],
): Promise<Set<string>> {
    if (organizationIds.length === 0) return new Set();
    const held = await db.organization.findMany({
        where: {
            id: { in: [...new Set(organizationIds)] },
            legalHoldAt: { not: null },
        },
        select: { id: true },
    });
    return new Set(held.map((o) => o.id));
}

/** Every business on legal hold. There are few; a sweep reads them once. */
export async function heldOrganizationIds(db: HoldReader): Promise<string[]> {
    const held = await db.organization.findMany({
        where: { legalHoldAt: { not: null } },
        select: { id: true },
    });
    return held.map((o) => o.id);
}

/** The refusal a member or an owner gets (409, `details.code` LEGAL_HOLD). */
export function legalHoldRefusal(): ConflictException {
    return new ConflictException({
        message: LEGAL_HOLD_MESSAGE,
        details: { code: LEGAL_HOLD_CODE, reason: "legal-hold" },
    });
}

/** Refuse when the business is on legal hold. */
export async function assertNotOnLegalHold(
    db: HoldReader,
    organizationId: string,
): Promise<void> {
    if (await onLegalHold(db, organizationId)) throw legalHoldRefusal();
}
