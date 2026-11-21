import { ConflictException, HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { outsideOrgContext, prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";
import { editionProfile } from "@saroh/edition";

import { env } from "../../env";
import { holdXactLock } from "../billing/xact-lock";
import { noticeOf } from "../notifications/notice-target";
import type { WindowLimiter } from "../rate-limits/shared-window";
import { SharedRateLimiter } from "../rate-limits/shared-window";
import { OrganizationLifecycleStatus } from "./organization-lifecycle.policy";

/**
 * One business on Free per person (M-4, DEC-227). A person may own (the
 * OWNER role, not any other) one business that isn't on a paid plan on
 * each edition, plus whatever exception staff granted them
 * (`User.extraFreeBusinesses`, from the console). A business that is
 * closing or deleted doesn't count; one on a paid plan does once that plan
 * has ended or been set to end, and while it is only a trial (a trial that
 * ends unpaid is on Free).
 *
 * Setting a business up past the rule is refused. A move down to Free is
 * never refused (20 Nov, owner): the business that moved last (or gained
 * the owner, or was restored) is marked (`freeLimitPausedAt`) and its
 * websites take no orders or bookings while the owner is still over
 * ({@link freeLimitPaused}, read by `overLimit.pausedNow`). Nothing else
 * changes, and it un-pauses on its own once it, or another of the owner's,
 * is upgraded or closed.
 *
 * Asked under a lock per person (`free-business:<userId>`), so two set-ups
 * or a set-up and a move to Free at once can't both pass.
 */

type Tx = Pick<
    Prisma.TransactionClient,
    "organization" | "user" | "membership" | "$executeRaw" | "$queryRaw"
>;

export const FREE_BUSINESS_TAKEN_MESSAGE =
    "You already own a business on the Free plan. Move that one to a paid plan in Plan and billing, then set up the new one, or write to us.";

/**
 * The refusal on `edition`: where Saroh bills nobody (Global launches
 * Free-only, P6) there is no paid plan to move to, so it says close.
 * shortcut: reads the edition, not the business's SAROH_BILLING_GLOBAL flag;
 * reword when Global's paid plans open.
 */
export const freeBusinessTakenMessage = (edition: Edition): string =>
    editionProfile(edition).sarohBilling
        ? FREE_BUSINESS_TAKEN_MESSAGE
        : "You already own a business on the Free plan. Close that one, then set up the new one, or write to us.";

/** Businesses still standing: not closing, not deleted. */
const STANDING = {
    lifecycleStatus: {
        in: [
            OrganizationLifecycleStatus.Active,
            OrganizationLifecycleStatus.Suspended,
        ],
    },
} satisfies Prisma.OrganizationWhereInput;

/** On a paid plan, past any trial, that hasn't ended and isn't set to end. */
const STAYS_PAID = {
    subscription: {
        is: {
            status: { notIn: ["CANCELLED", "TRIALING"] },
            cancelAtPeriodEnd: false,
            plan: { priceCents: { gt: 0 } },
        },
    },
} satisfies Prisma.OrganizationWhereInput;

/** On Free now: no live paid plan (a trial still running is paid). */
const ON_FREE_NOW = {
    NOT: {
        subscription: {
            is: {
                status: { not: "CANCELLED" },
                plan: { priceCents: { gt: 0 } },
            },
        },
    },
} satisfies Prisma.OrganizationWhereInput;

/** The businesses this person owns on `edition` that are (or are going) on Free. */
export function ownedFreeWhere(
    userId: string,
    edition: Edition,
    exceptOrganizationId?: string,
): Prisma.OrganizationWhereInput {
    return {
        ...STANDING,
        edition,
        memberships: { some: { userId, role: "OWNER" } },
        NOT: STAYS_PAID,
        ...(exceptOrganizationId ? { id: { not: exceptOrganizationId } } : {}),
    };
}

async function lockPeople(tx: Tx, userIds: readonly string[]) {
    const people = [...new Set(userIds)].sort();
    for (const userId of people) {
        await holdXactLock(tx, `free-business:${userId}`);
    }
    return people;
}

/**
 * Whether `userId` already owns as many Free businesses on `edition` as
 * they may, `exceptOrganizationId` left out, and of the paused ones only
 * those marked before `before` (the one marked last is the one paused).
 * The person's other businesses are read outside the caller's row-level
 * security, on their own connection (a business's request sees only its
 * own rows), as `holdPayerOffersInTx` reads the payer's; callers in a
 * transaction hold the person's lock first.
 */
async function atLimit(
    userId: string,
    edition: Edition,
    exceptOrganizationId?: string,
    before?: Date,
): Promise<boolean> {
    const [owned, user] = await outsideOrgContext(() =>
        Promise.all([
            prisma.organization.count({
                where: {
                    ...ownedFreeWhere(userId, edition, exceptOrganizationId),
                    ...(before
                        ? {
                              OR: [
                                  { freeLimitPausedAt: null },
                                  { freeLimitPausedAt: { lt: before } },
                              ],
                          }
                        : {}),
                },
            }),
            prisma.user.findUnique({
                where: { id: userId },
                select: { extraFreeBusinesses: true },
            }),
        ]),
    );
    return owned >= 1 + Math.max(0, user?.extraFreeBusinesses ?? 0);
}

/**
 * Refuse (409 `FREE_BUSINESS_TAKEN`) setting up a business on `edition`
 * when one of these people already owns as many Free businesses there as
 * they may. Takes each person's lock first, in one order, for the rest of
 * the transaction.
 */
export async function assertMayOwnAnotherFreeInTx(
    tx: Tx,
    userIds: readonly string[],
    edition: Edition,
): Promise<void> {
    for (const userId of await lockPeople(tx, userIds)) {
        if (await atLimit(userId, edition)) {
            throw new ConflictException({
                message: freeBusinessTakenMessage(edition),
                details: { code: "FREE_BUSINESS_TAKEN" },
            });
        }
    }
}

/** What the owner reads when a business is paused by the rule. */
export const FREE_LIMIT_PAUSED_WORDS = {
    title: (name: string) => `${name} has stopped taking orders and bookings`,
    body: "You already own another business on the Free plan, and each person can own one. Everything in this business is kept, but its website isn't taking orders or bookings. Choose a paid plan for it in Plan and billing, or upgrade or close your other free business, and it starts again at once.",
};

/**
 * After a business moved to Free, gained an owner, or was restored: mark
 * it when an owner (`onlyUserIds`, else every owner) already owns as many
 * Free businesses on its edition as they may, and tell the business once;
 * a move that leaves nobody over clears the mark. Never refuses. A
 * business not on Free now is left as it is (a move set for a later date
 * is settled when it is applied). True when it is marked.
 */
export async function settleFreeLimitInTx(
    tx: Tx & Pick<Prisma.TransactionClient, "notification">,
    organizationId: string,
    onlyUserIds?: readonly string[],
): Promise<boolean> {
    const org = await tx.organization.findFirst({
        where: { id: organizationId, ...STANDING, ...ON_FREE_NOW },
        select: { name: true, edition: true, freeLimitPausedAt: true },
    });
    if (!org) return false;
    const owners =
        onlyUserIds ??
        (
            await tx.membership.findMany({
                where: { organizationId, role: "OWNER" },
                select: { userId: true },
            })
        ).map((o) => o.userId);
    let over = false;
    for (const userId of await lockPeople(tx, owners)) {
        if (await atLimit(userId, org.edition, organizationId)) {
            over = true;
            break;
        }
    }
    if (over === (org.freeLimitPausedAt !== null)) return over;
    // A check of one new owner only adds a mark; it never clears another's.
    if (!over && onlyUserIds) return false;
    await tx.organization.update({
        where: { id: organizationId },
        data: { freeLimitPausedAt: over ? new Date() : null },
    });
    if (over) {
        await tx.notification.create({
            data: {
                organizationId,
                // It opens Plan and billing.
                ...noticeOf("plan.changed", {}),
                title: FREE_LIMIT_PAUSED_WORDS.title(org.name),
                body: FREE_LIMIT_PAUSED_WORDS.body,
            },
        });
    }
    return over;
}

/**
 * Whether the rule pauses this business now: marked, on Free now, and an
 * owner still owns as many other Free businesses on its edition as they
 * may (counting only those marked before it).
 */
export async function freeLimitPaused(
    organizationId: string,
    db: Pick<Prisma.TransactionClient, "organization" | "user"> = prisma,
): Promise<boolean> {
    const org = await db.organization.findFirst({
        where: {
            id: organizationId,
            freeLimitPausedAt: { not: null },
            ...STANDING,
            ...ON_FREE_NOW,
        },
        select: {
            edition: true,
            freeLimitPausedAt: true,
            memberships: { where: { role: "OWNER" }, select: { userId: true } },
        },
    });
    if (!org?.freeLimitPausedAt) return false;
    for (const { userId } of org.memberships) {
        if (
            await atLimit(
                userId,
                org.edition,
                organizationId,
                org.freeLimitPausedAt,
            )
        )
            return true;
    }
    return false;
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
