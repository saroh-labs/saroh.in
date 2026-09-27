import type { prisma, Prisma } from "@saroh/database";

import { paymentsOn } from "../invoices/payments-on";
import type { HomeAction, HomeEvidence } from "./home-model";
import { EVIDENCE_LIMIT, personName } from "./home-model";

type Db = typeof prisma;

/** The Needs-you code for pauses that ended while Payments is off (D8). */
export const PAUSES_WAITING_CODE = "PAYMENTS_PAUSES_WAITING";

/**
 * Pauses whose end date has come but that the renewal job couldn't resume
 * (plan 2026-09-26-004, D8; overview default 100): past the paid period a
 * resume starts a new period with its invoice, and Payments is off, so they
 * stay paused until someone turns it on. One action for them all, read from
 * the subscriptions themselves rather than their RESUME_REFUSED events, so
 * it is gone the moment Payments is back on or one is resumed or
 * cancelled by hand.
 *
 * Shown whatever the Payments module's state — it is off, which is the
 * point — to anyone who reads subscriptions.
 */
export async function pausesWaitingOnPayments(
    db: Db,
    organizationId: string,
    now: Date,
): Promise<HomeAction | null> {
    if (await paymentsOn(db, organizationId)) return null;
    const where = {
        organizationId,
        status: "PAUSED",
        pausedUntil: { lte: now },
        currentPeriodEnd: { lte: now },
        // One set to end just ends, which needs no Payments.
        cancelAtPeriodEnd: false,
    } satisfies Prisma.CustomerSubscriptionWhereInput;
    const [count, rows] = await Promise.all([
        db.customerSubscription.count({ where }),
        db.customerSubscription.findMany({
            where,
            orderBy: [{ pausedUntil: "asc" }, { id: "asc" }],
            take: EVIDENCE_LIMIT,
            select: {
                id: true,
                pausedUntil: true,
                plan: { select: { name: true } },
                contact: {
                    select: { firstName: true, lastName: true, email: true },
                },
            },
        }),
    ]);
    if (count === 0 || rows.length === 0) return null;

    const evidence: HomeEvidence[] = rows.map((r) => ({
        id: r.id,
        title: r.plan.name,
        subtitle: personName(r.contact),
        at: r.pausedUntil?.toISOString() ?? null,
        amountMinor: null,
        currency: null,
        href: `/billing/subscriptions/${r.id}`,
        tag: "Pause ended",
        tone: "bad",
    }));
    const first = evidence[0];
    const whose = first.subtitle ? `${first.subtitle}'s` : "a";
    return {
        code: PAUSES_WAITING_CODE,
        title:
            count === 1
                ? `Turn Payments on to restart ${whose} ${first.title}`
                : `Turn Payments on to restart ${count} paused subscriptions`,
        href: "/settings/modules",
        severity: "ATTENTION",
        moduleKey: "PAYMENTS",
        count,
        evidence,
        tag: "Pause ended",
        tone: "bad",
    };
}
