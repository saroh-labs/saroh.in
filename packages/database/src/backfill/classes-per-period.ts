/**
 * D10 backfill — every live subscription holds its own classes a month.
 *
 * Round 2, D10 (plan 2026-09-26-004): a subscription takes its plan's
 * `classesPerMonth` into `classesPerPeriod` at subscribe and at each
 * renewal, and stamps `classesPerPeriodSetAt`. The migration
 * `20261013180000_subscription_classes_per_period` does this once for the
 * rows that exist then. The previous API image keeps creating and renewing
 * subscriptions until it stops serving — and again after a rollback —
 * without setting either column, so this is re-run after the deploy settles
 * (docs/architecture/ROUND_2_PHASE_2_ROLLOUT.md, D10).
 *
 * It sets only a live (ACTIVE or PAUSED) subscription whose
 * `classesPerPeriodSetAt` is null, to its plan's classes a month as they
 * stand — what the API serves for that row (logged since Z1), so no member's
 * allowance moves. A null (no allowance) is copied as null and counts as
 * set. A row already set is never touched, so it is idempotent: a second
 * run fills nothing. Safe while either image serves: one statement, and a
 * row a renewal changes under it is left for the next run.
 *
 * Run: `DATABASE_URL=... DATABASE_TARGET_CONFIRM=<database> pnpm --filter
 * @saroh/database exec tsx src/backfill/classes-per-period.cli.ts`
 */
import type { PrismaClient } from "@prisma/client";

/** Live subscriptions whose allowance was never set (Z1's pre-deploy gate: 0). */
export const CLASSES_PER_PERIOD_UNSET_WHERE = {
    status: { not: "CANCELLED" },
    classesPerPeriodSetAt: null,
};

export interface ClassesPerPeriodBackfillReport {
    /** Live subscriptions unset before the run. */
    unsetBefore: number;
    /** Rows this run set. */
    filled: number;
    /** Live subscriptions still unset after it: must be 0. */
    unsetAfter: number;
}

export async function unsetClassesPerPeriod(
    prisma: PrismaClient,
): Promise<number> {
    return prisma.customerSubscription.count({
        where: CLASSES_PER_PERIOD_UNSET_WHERE,
    });
}

export async function backfillClassesPerPeriod(
    prisma: PrismaClient,
    now: Date = new Date(),
): Promise<ClassesPerPeriodBackfillReport> {
    const unsetBefore = await unsetClassesPerPeriod(prisma);
    const filled = await prisma.$executeRaw`
        UPDATE "CustomerSubscription" s
        SET "classesPerPeriod" = p."classesPerMonth",
            "classesPerPeriodSetAt" = ${now}
        FROM "SubscriptionPlan" p
        WHERE p."id" = s."planId"
          AND s."classesPerPeriodSetAt" IS NULL
          AND s."status" <> 'CANCELLED'`;
    const unsetAfter = await unsetClassesPerPeriod(prisma);
    return { unsetBefore, filled, unsetAfter };
}
