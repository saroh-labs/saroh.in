import { ConflictException, HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { env } from "../../env";
import { holdXactLock } from "../billing/metering.service";
import type { WindowLimiter } from "../rate-limits/shared-window";
import { SharedRateLimiter } from "../rate-limits/shared-window";
import { OrganizationLifecycleStatus } from "./organization-lifecycle.policy";

/**
 * One business on Free per person (M-4, DEC-227). A person may own (the
 * OWNER role, not any other) one business that isn't on a paid plan, plus
 * whatever exception staff granted them (`User.extraFreeBusinesses`, from
 * the console). A business that is closing or deleted doesn't count; one
 * on a paid plan does only once that plan has ended or been set to end.
 *
 * Asked under a lock per person (`free-business:<userId>`), so two set-ups
 * or a set-up and a move to Free at once can't both pass.
 */

type Tx = Pick<
    Prisma.TransactionClient,
    "organization" | "user" | "$executeRaw" | "$queryRaw"
>;

export const FREE_BUSINESS_TAKEN_MESSAGE =
    "You already have a free business. Upgrade it, or choose a paid plan for the new one.";

/** Businesses still standing: not closing, not deleted. */
const STANDING = {
    lifecycleStatus: {
        in: [
            OrganizationLifecycleStatus.Active,
            OrganizationLifecycleStatus.Suspended,
        ],
    },
} satisfies Prisma.OrganizationWhereInput;

/** On a paid plan that hasn't ended and isn't set to end. */
const STAYS_PAID = {
    subscription: {
        is: {
            status: { not: "CANCELLED" },
            cancelAtPeriodEnd: false,
            plan: { priceCents: { gt: 0 } },
        },
    },
} satisfies Prisma.OrganizationWhereInput;

/** The businesses this person owns that are (or are going) on Free. */
export function ownedFreeWhere(
    userId: string,
    exceptOrganizationId?: string,
): Prisma.OrganizationWhereInput {
    return {
        ...STANDING,
        memberships: { some: { userId, role: "OWNER" } },
        NOT: STAYS_PAID,
        ...(exceptOrganizationId ? { id: { not: exceptOrganizationId } } : {}),
    };
}

/**
 * Refuse (409 `FREE_BUSINESS_TAKEN`) when each of these people already
 * owns as many Free businesses as they may, `exceptOrganizationId` left
 * out (the business moving to Free). Takes each person's lock first, in
 * one order, for the rest of the transaction.
 */
export async function assertMayOwnAnotherFreeInTx(
    tx: Tx,
    userIds: readonly string[],
    exceptOrganizationId?: string,
): Promise<void> {
    const people = [...new Set(userIds)].sort();
    for (const userId of people) {
        await holdXactLock(tx, `free-business:${userId}`);
    }
    for (const userId of people) {
        const [owned, user] = await Promise.all([
            tx.organization.count({
                where: ownedFreeWhere(userId, exceptOrganizationId),
            }),
            tx.user.findUnique({
                where: { id: userId },
                select: { extraFreeBusinesses: true },
            }),
        ]);
        if (owned >= 1 + Math.max(0, user?.extraFreeBusinesses ?? 0)) {
            throw new ConflictException({
                message: FREE_BUSINESS_TAKEN_MESSAGE,
                details: { code: "FREE_BUSINESS_TAKEN" },
            });
        }
    }
}

/** Set-ups a day for one person, unset. */
export const DEFAULT_BUSINESS_CREATES_PER_DAY = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

let shared: SharedRateLimiter | null | undefined;

/** The shared per-person set-up limiter, or null when it is turned off. */
export function businessCreationLimiter(): WindowLimiter | null {
    if (shared === undefined) {
        const raw = env.BUSINESS_CREATES_PER_DAY;
        const cap =
            raw === undefined ? DEFAULT_BUSINESS_CREATES_PER_DAY : Number(raw);
        shared =
            cap > 0
                ? new SharedRateLimiter("business-creates", cap, DAY_MS)
                : null;
    }
    return shared;
}

/** 429 past the person's set-ups for the day; nothing was made. */
export async function takeBusinessCreation(
    limiter: WindowLimiter | null,
    userId: string,
): Promise<void> {
    if (!limiter || (await limiter.take(userId))) return;
    const wait = await limiter.retryAfterSeconds(userId);
    throw new HttpException(
        {
            message:
                "You've set up several businesses today. Try again tomorrow, or write to us.",
            details: { code: "BUSINESS_CREATES_LIMITED", retryAfter: wait },
        },
        HttpStatus.TOO_MANY_REQUESTS,
    );
}
