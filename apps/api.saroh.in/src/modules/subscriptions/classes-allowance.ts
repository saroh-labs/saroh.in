import type { Prisma } from "@saroh/database";

/**
 * A membership's classes a month (round 2, D10; plan 004 R10).
 *
 * A subscription takes its plan's `classesPerMonth` at subscribe and at each
 * renewal, into `classesPerPeriod` with `classesPerPeriodSetAt`, so a change
 * to the plan reaches each member at their next renewal. Every read of a
 * member's allowance — a booking with the membership (`use-membership.ts`),
 * Customer Detail's "classes left" — goes through {@link classesAllowance}.
 *
 * **The fallback (one release; follow-up Z1 removes it).** The previous API
 * image keeps creating and renewing subscriptions during a deploy and after
 * a rollback without setting either column, and a plain null means "no
 * allowance" (unlimited). So while `classesPerPeriodSetAt` is null the
 * plan's value is read, as before D10; only a set timestamp makes the
 * subscription's own value, null included, authoritative. The backfill
 * (`packages/database/src/backfill/classes-per-period.ts`) sets the rows the
 * old image wrote, and is re-run after each deploy of this release.
 */

/** What {@link classesAllowance} reads from a subscription row. */
export const ALLOWANCE_SELECT = {
    classesPerPeriod: true,
    classesPerPeriodSetAt: true,
} as const;

export interface AllowanceSource {
    classesPerPeriod: number | null;
    classesPerPeriodSetAt: Date | null;
    plan: { classesPerMonth: number | null };
}

/** The classes a month this period includes; null is no allowance. */
export function classesAllowance(sub: AllowanceSource): number | null {
    // Z1: never set by this release — a row the previous image wrote.
    if (!sub.classesPerPeriodSetAt) return sub.plan.classesPerMonth;
    return sub.classesPerPeriod;
}

/** Subscriptions whose period includes a number of classes a month. */
export const HAS_ALLOWANCE_WHERE = {
    OR: [
        {
            classesPerPeriodSetAt: { not: null },
            classesPerPeriod: { not: null },
        },
        // Z1: the fallback's rows read the plan's value.
        {
            classesPerPeriodSetAt: null,
            plan: { classesPerMonth: { not: null } },
        },
    ],
} satisfies Prisma.CustomerSubscriptionWhereInput;

/** The row change that fixes a period's allowance at `at`. */
export function allowanceData(
    classesPerMonth: number | null,
    at: Date,
): { classesPerPeriod: number | null; classesPerPeriodSetAt: Date } {
    return { classesPerPeriod: classesPerMonth, classesPerPeriodSetAt: at };
}
