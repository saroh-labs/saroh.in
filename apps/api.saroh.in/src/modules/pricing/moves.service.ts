import type { Prisma } from "@saroh/database";
import {
    CATALOG_PLAN_KEY_PREFIX,
    MOVE_NOTICE_DAYS,
    moveDateFor,
    moveNoticeDays,
} from "@saroh/pricing-catalog";

/**
 * "Move them" (plans catalogue KTD-4, design deviation D-6): when a version
 * is published with policy `move`, every subscription on an older catalogue
 * version gets a pending move to the same plan and cycle on the new version,
 * at its first billing date at least {@link MOVE_NOTICE_DAYS} days after the
 * version goes live — `PRICE_NOTICE_DAYS` when the price it pays
 * changes (DEC-161: no price lock, at least 30 days' notice). The renewal
 * path applies it (U15); it is never applied while the version's paid plans
 * aren't at the billing provider, nor at a new amount the business hasn't
 * approved (`moveReadiness`): until it approves, it keeps paying the price
 * it has.
 *
 * A business whose plan actually changes hears about it that many days
 * ahead (`pricing.move.notice`; a price change by email too); one whose
 * plan reads the same on the new version is moved without a notice, since
 * there is nothing to tell it.
 */
export const PRICING_MOVE_NOTICE_TYPE = "pricing.move.notice";

const DAY_MS = 24 * 60 * 60 * 1000;

type Tx = Pick<Prisma.TransactionClient, "plan" | "subscription" | "job">;

export interface MoveNoticePayload {
    subscriptionId: string;
    pendingPlanId: string;
    /** ISO; the notice is for this move only. */
    pendingFrom: string;
}

export interface ScheduledMoves {
    /** Subscriptions given a pending move. */
    moved: number;
    /** Of those, the ones told ahead because their plan changes. */
    notices: number;
}

/** Statuses that renew, and so can move. A cancelled subscription can't. */
const MOVABLE_STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE"];

/**
 * When one subscription moves: its first renewal at least the notice period
 * after go-live, or — with no renewal date (a free plan bills nothing) —
 * exactly the notice period after go-live. The notice period is
 * `moveNoticeDays`: 30 days when the price changes, else 7.
 */
export function pendingFromFor(
    currentPeriodEnd: Date | null,
    goLiveAt: Date,
    cycle: "month" | "year",
    noticeDays: number = MOVE_NOTICE_DAYS,
): Date {
    if (!currentPeriodEnd) {
        return new Date(goLiveAt.getTime() + noticeDays * DAY_MS);
    }
    return moveDateFor(currentPeriodEnd, goLiveAt, cycle, noticeDays);
}

/** How far ahead a move between two `Plan` rows is told (DEC-161). */
export function noticeDaysFor(
    from: { priceCents: number },
    to: { priceCents: number },
): number {
    return moveNoticeDays(from.priceCents, to.priceCents);
}

/** Whether two `Plan` rows read the same to a business: nothing to tell it. */
export function samePlan(
    a: { name: string; priceCents: number; entitlements: unknown },
    b: { name: string; priceCents: number; entitlements: unknown },
): boolean {
    return (
        a.name === b.name &&
        a.priceCents === b.priceCents &&
        JSON.stringify(a.entitlements) === JSON.stringify(b.entitlements)
    );
}

/** Pending notice jobs for these subscriptions, which a newer move supersedes. */
async function dropNotices(
    tx: Tx,
    keep: (p: MoveNoticePayload) => boolean,
): Promise<number> {
    const jobs = await tx.job.findMany({
        where: { type: PRICING_MOVE_NOTICE_TYPE, status: "PENDING" },
        select: { id: true, payload: true },
    });
    const drop = jobs
        .filter((j) => !keep(j.payload as unknown as MoveNoticePayload))
        .map((j) => j.id);
    if (!drop.length) return 0;
    // Fenced on PENDING: a notice already being sent is left to finish (its
    // handler re-reads the subscription and says nothing if the move is gone).
    const r = await tx.job.deleteMany({
        where: { id: { in: drop }, status: "PENDING" },
    });
    return r.count;
}

/**
 * Schedule "move them" for a version just written on `tx`. Call it inside
 * the publish transaction, after the version's `Plan` rows exist.
 */
export async function scheduleMoves(
    tx: Tx,
    input: { version: number; goLiveAt: Date },
): Promise<ScheduledMoves> {
    const targets = await tx.plan.findMany({
        where: {
            version: input.version,
            key: { startsWith: CATALOG_PLAN_KEY_PREFIX },
        },
        select: {
            id: true,
            key: true,
            interval: true,
            name: true,
            priceCents: true,
            entitlements: true,
        },
    });
    const targetOf = new Map(targets.map((t) => [`${t.key}|${t.interval}`, t]));

    const subs = await tx.subscription.findMany({
        where: {
            status: { in: MOVABLE_STATUSES },
            plan: {
                key: { startsWith: CATALOG_PLAN_KEY_PREFIX },
                version: { lt: input.version },
            },
        },
        select: {
            id: true,
            organizationId: true,
            currentPeriodEnd: true,
            plan: {
                select: {
                    key: true,
                    interval: true,
                    name: true,
                    priceCents: true,
                    entitlements: true,
                },
            },
            pendingPlan: { select: { key: true, interval: true } },
        },
    });

    const moving = new Set<string>();
    let notices = 0;
    const jobs: {
        organizationId: string;
        runAt: Date;
        payload: MoveNoticePayload;
    }[] = [];
    for (const sub of subs) {
        // A change the business chose for the end of its period (another
        // plan or cycle, U15) stands: a publish never overrides it.
        if (
            sub.pendingPlan &&
            (sub.pendingPlan.key !== sub.plan.key ||
                sub.pendingPlan.interval !== sub.plan.interval)
        ) {
            continue;
        }
        // A plan the new version dropped has nowhere to move to: it keeps
        // its terms (the business stays on its version).
        const target = targetOf.get(`${sub.plan.key}|${sub.plan.interval}`);
        if (!target) continue;
        const cycle = sub.plan.interval === "year" ? "year" : "month";
        const noticeDays = noticeDaysFor(sub.plan, target);
        const pendingFrom = pendingFromFor(
            sub.currentPeriodEnd,
            input.goLiveAt,
            cycle,
            noticeDays,
        );
        await tx.subscription.update({
            where: { id: sub.id },
            data: { pendingPlanId: target.id, pendingFrom },
        });
        moving.add(sub.id);
        if (!samePlan(sub.plan, target)) {
            notices += 1;
            jobs.push({
                organizationId: sub.organizationId,
                // At least `noticeDays` ahead, and never before go-live:
                // `pendingFrom` is that far after go-live at the earliest.
                runAt: new Date(pendingFrom.getTime() - noticeDays * DAY_MS),
                payload: {
                    subscriptionId: sub.id,
                    pendingPlanId: target.id,
                    pendingFrom: pendingFrom.toISOString(),
                },
            });
        }
    }

    // An earlier move's notice is superseded by this one.
    await dropNotices(tx, (p) => !moving.has(p.subscriptionId));
    for (const j of jobs) {
        await tx.job.create({
            data: {
                type: PRICING_MOVE_NOTICE_TYPE,
                organizationId: j.organizationId,
                runAt: j.runAt,
                payload: { ...j.payload },
            },
        });
    }
    return { moved: moving.size, notices };
}

/**
 * Undo the moves to a version that is being cancelled: clear each pending
 * move (both columns together, the table's CHECK) and drop the notices not
 * yet sent. Returns how many subscriptions it cleared.
 */
export async function cancelMovesTo(tx: Tx, version: number): Promise<number> {
    const plans = await tx.plan.findMany({
        where: { version, key: { startsWith: CATALOG_PLAN_KEY_PREFIX } },
        select: { id: true },
    });
    const ids = new Set(plans.map((p) => p.id));
    if (!ids.size) return 0;
    const cleared = await tx.subscription.updateMany({
        where: { pendingPlanId: { in: [...ids] } },
        data: { pendingPlanId: null, pendingFrom: null },
    });
    await dropNotices(tx, (p) => !ids.has(p.pendingPlanId));
    return cleared.count;
}
