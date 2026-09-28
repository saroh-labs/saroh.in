import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/**
 * Which plans are on sale (round-2 D21, the reader half of plan 004's D5).
 *
 * A plan's `status` is a String: ACTIVE, ARCHIVED, and — once D5's writers
 * ship — DRAFT. Only an ACTIVE plan takes new sign-ups. A DRAFT isn't
 * published yet, and an ARCHIVED plan takes no new sign-ups; both keep
 * whoever is already on them.
 *
 * Every path that sells a plan checks {@link assertPlanOnSale}, and every
 * read that lists plans for sale (the site's plan lists and blocks, a
 * customer's own sign-up) filters by {@link PLANS_ON_SALE}. These readers
 * ship a release before anything can create a draft, so rolling back never
 * lands on an API that would sell one.
 */

export const PLAN_ON_SALE = "ACTIVE";
export const PLAN_DRAFT = "DRAFT";

/** The `where` for any read that lists plans a buyer can choose. */
export const PLANS_ON_SALE = {
    status: PLAN_ON_SALE,
} as const satisfies Prisma.SubscriptionPlanWhereInput;

/** Said when someone tries to sell, switch to or reopen a draft plan. */
export const PLAN_NOT_PUBLISHED = "This plan isn't published yet";

/**
 * Refuse a plan that isn't on sale. A draft is a 409 (the plan exists but
 * can't be sold until it is published); an archived plan stays today's 400
 * on the field, so the app's form keeps showing it where it did.
 */
export function assertPlanOnSale(
    plan: { status: string },
    field = "planId",
): void {
    if (plan.status === PLAN_ON_SALE) return;
    if (plan.status === PLAN_DRAFT) {
        throw new ConflictException({
            message: PLAN_NOT_PUBLISHED,
            details: { field },
        });
    }
    throw new BadRequestException({
        message: "That plan is archived and takes no new sign-ups",
        details: { field },
    });
}
