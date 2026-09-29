import type { Prisma } from "@saroh/database";

import { structuredLogger } from "../../common/logging/structured-logger";

/**
 * A membership's classes a month (round 2, D10; plan 004 R10).
 *
 * A subscription takes its plan's `classesPerMonth` at subscribe and at each
 * renewal, into `classesPerPeriod` with `classesPerPeriodSetAt`, so a change
 * to the plan reaches each member at their next renewal. Every read of a
 * member's allowance — a booking with the membership (`use-membership.ts`),
 * Customer Detail's "classes left", the account's Home and Plan tab — goes
 * through {@link classesAllowance}.
 *
 * **No fallback (follow-up Z1).** D10's release read the plan's value while
 * `classesPerPeriodSetAt` was null, for the rows the previous API image
 * wrote during its deploy. Z1 ships only once production holds none (the
 * pre-deploy gate in `ROUND_2_PHASE_2_ROLLOUT.md`, "Z1"), so a set stamp is
 * the only designed state and the subscription's own value, null included,
 * is authoritative.
 *
 * An unset row can still appear if the API is rolled back below D10 and the
 * backfill (`packages/database/src/backfill/classes-per-period.ts`) is not
 * re-run before redeploying. Then {@link classesAllowance} does not crash and
 * never reads the null as unlimited: it logs `subscription_allowance_unset`
 * at ERROR (an invariant broke; any volume means run the backfill) and
 * serves what D10's plan documents for such a row, the plan's classes as
 * they stand.
 */

/** What {@link classesAllowance} reads from a subscription row. */
export const ALLOWANCE_SELECT = {
    classesPerPeriod: true,
    classesPerPeriodSetAt: true,
} as const;

export interface AllowanceSource {
    id: string;
    classesPerPeriod: number | null;
    classesPerPeriodSetAt: Date | null;
    plan: { classesPerMonth: number | null };
}

/** The event an unset row logs; the rollout doc's Z1 section names it. */
export const ALLOWANCE_UNSET_EVENT = "subscription_allowance_unset";

/** The classes a month this period includes; null is no allowance. */
export function classesAllowance(sub: AllowanceSource): number | null {
    if (sub.classesPerPeriodSetAt) return sub.classesPerPeriod;
    // Never set: a row an API below D10 wrote. Loud, but never unlimited.
    structuredLogger.error(ALLOWANCE_UNSET_EVENT, {
        subscriptionId: sub.id,
        served: "plan.classesPerMonth",
        fix: "run the classes-per-period backfill",
    });
    return sub.plan.classesPerMonth;
}

/**
 * Subscriptions whose period includes a number of classes a month. An unset
 * row is matched on its plan's value, so it reaches {@link classesAllowance}
 * and is logged rather than silently hidden.
 */
export const HAS_ALLOWANCE_WHERE = {
    OR: [
        {
            classesPerPeriodSetAt: { not: null },
            classesPerPeriod: { not: null },
        },
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
