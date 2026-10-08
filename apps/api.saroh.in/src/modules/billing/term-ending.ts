import type { Prisma } from "@saroh/database";
import { liveCatalogueVersion } from "@saroh/database";
import { addMonthsUtc } from "@saroh/pricing-catalog";

import type { Term } from "./billing-term";
import { ONE_TIME_PAYMENT, termOf } from "./billing-term";
import { RENEW_WINDOW_DAYS, TERM_CHARGES } from "./checkout-quote";
import type { PlanEndingStage } from "./plan-ending";
import { PLAN_ENDING_NOTICE_DAYS, planEndingStage } from "./plan-ending";

type Tx = Prisma.TransactionClient;

/**
 * A 12-month term about to end (DEC-100): a monthly plan's 12 charges are
 * done, or a yearly plan's paid year is ending. Inside the renew window
 * (the last `RENEW_WINDOW_DAYS`) the business is asked to pay for the next
 * term, 30, 7 and 1 days ahead, the #805 plan-ending pattern: an inbox
 * notice (`plan.ending`) and an email to its billing people, each claimed
 * once per subscription, end and stage as a `CustomerNotice`. Paying
 * resubscribes it (the RENEW checkout); not paying moves it to Free at the
 * end (`term-end.ts`).
 *
 * A business that has already arranged what follows — the renewal or
 * another paid plan authorised (a SCHEDULED checkout), or a move that takes
 * over before the end — is not asked. One whose owner chose Free (or
 * cancelled) for the period's end (`freeChosenAt`) isn't asked either: it
 * is told its plan moves to Free then, as it chose (`chosenFree`).
 */

/** The once-only claim on each notice (`CustomerNotice.kind`). */
export const TERM_ENDING_NOTICE_KIND = "TERM_ENDING";

/** The notices' days, only those inside the renew window. */
const TERM_NOTICE_DAYS = PLAN_ENDING_NOTICE_DAYS.filter(
    (d) => d <= RENEW_WINDOW_DAYS,
);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which notice is due, as `planEndingStage`, within the renew window. */
export function termEndingStage(
    endsAt: Date,
    now: Date,
): PlanEndingStage | null {
    const stage = planEndingStage(endsAt, now);
    return stage && TERM_NOTICE_DAYS.includes(stage) ? stage : null;
}

/** One notice per subscription, term end and stage. */
export function termEndingEventKey(
    subscriptionId: string,
    endsAt: Date,
    stage: PlanEndingStage,
): string {
    return `term-ending:${subscriptionId}:${endsAt.toISOString()}:${stage}`;
}

/** A term the business should be asked to pay for again, as read now. */
export interface TermEnding {
    subscriptionId: string;
    organizationId: string;
    planName: string;
    term: Term;
    stage: PlanEndingStage;
    /** The plan's live price before GST, or null when it isn't offered. */
    nextPricePaise: number | null;
    /** The owner chose Free for the end: told so, never asked to pay. */
    chosenFree: boolean;
}

/**
 * The term ending for a subscription, read now: null when it has none,
 * isn't inside its notices' days, or the business has already arranged
 * what follows. The sweep and the email both read it, so an email queued
 * before a renewal says nothing.
 */
export async function termEndingOf(
    db: Tx,
    subscriptionId: string,
    now: Date,
): Promise<TermEnding | null> {
    const sub = await db.subscription.findUnique({
        where: { id: subscriptionId },
        select: {
            id: true,
            organizationId: true,
            status: true,
            provider: true,
            providerSubscriptionId: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            freeChosenAt: true,
            pendingFrom: true,
            pendingPlan: { select: { priceCents: true } },
            plan: {
                select: {
                    name: true,
                    key: true,
                    interval: true,
                    priceCents: true,
                },
            },
        },
    });
    if (
        !sub ||
        sub.status === "CANCELLED" ||
        !sub.provider ||
        !sub.providerSubscriptionId ||
        sub.plan.priceCents <= 0
    ) {
        return null;
    }
    const checkout = await db.billingCheckout.findUnique({
        where: {
            provider_providerSubscriptionId: {
                provider: sub.provider,
                providerSubscriptionId: sub.providerSubscriptionId,
            },
        },
        select: {
            providerPlanId: true,
            cycle: true,
            startAt: true,
            completedAt: true,
            createdAt: true,
        },
    });
    const term = termOf(sub, checkout, now);
    if (!term?.renewOpen) return null;
    const stage = termEndingStage(term.endsAt, now);
    if (!stage) return null;
    // Arranged already: a move that takes over first, a paid plan to come,
    // or a renewal (or other plan) authorised and waiting.
    if (sub.pendingFrom && sub.pendingFrom < term.endsAt) return null;
    if ((sub.pendingPlan?.priceCents ?? 0) > 0) return null;
    const waiting = await db.billingCheckout.findFirst({
        where: { organizationId: sub.organizationId, status: "SCHEDULED" },
        select: { id: true },
    });
    if (waiting) return null;

    const live = await liveCatalogueVersion(db, now);
    const next = live
        ? await db.plan.findUnique({
              where: {
                  key_version_interval: {
                      key: sub.plan.key,
                      version: live.version,
                      interval: sub.plan.interval,
                  },
              },
              select: { priceCents: true, active: true },
          })
        : null;
    return {
        subscriptionId: sub.id,
        organizationId: sub.organizationId,
        planName: sub.plan.name,
        term,
        stage,
        nextPricePaise:
            next?.active && next.priceCents > 0 ? next.priceCents : null,
        chosenFree: sub.freeChosenAt !== null && sub.cancelAtPeriodEnd,
    };
}

/**
 * Subscriptions whose term may end within the renew window, by id: yearly
 * plans paid once by their period's end,
 * monthly autopay by when their charges started (12 months before the end,
 * with a few days' slack for short months; `termEndingOf` decides).
 */
export async function termEndingCandidates(
    db: Pick<Tx, "subscription" | "billingCheckout">,
    now: Date,
): Promise<string[]> {
    const horizon = new Date(now.getTime() + RENEW_WINDOW_DAYS * DAY_MS);
    const slack = 3 * DAY_MS;
    const from = new Date(addMonthsUtc(now, -TERM_CHARGES).getTime() - slack);
    const to = new Date(addMonthsUtc(horizon, -TERM_CHARGES).getTime() + slack);
    const [yearly, monthly] = await Promise.all([
        db.subscription.findMany({
            where: {
                status: { not: "CANCELLED" },
                provider: { not: null },
                providerSubscriptionId: { not: null },
                currentPeriodEnd: { gt: now, lte: horizon },
            },
            select: { id: true },
        }),
        db.billingCheckout.findMany({
            where: {
                status: "COMPLETED",
                cycle: "month",
                providerPlanId: { not: ONE_TIME_PAYMENT },
                OR: [
                    { startAt: { gte: from, lte: to } },
                    { startAt: null, completedAt: { gte: from, lte: to } },
                    {
                        startAt: null,
                        completedAt: null,
                        createdAt: { gte: from, lte: to },
                    },
                ],
            },
            select: { provider: true, providerSubscriptionId: true },
        }),
    ]);
    const ids = new Set(yearly.map((s) => s.id));
    if (monthly.length > 0) {
        const subs = await db.subscription.findMany({
            where: {
                status: { not: "CANCELLED" },
                OR: monthly.map((c) => ({
                    provider: c.provider,
                    providerSubscriptionId: c.providerSubscriptionId,
                })),
            },
            select: { id: true },
        });
        for (const s of subs) ids.add(s.id);
    }
    return [...ids].sort();
}
