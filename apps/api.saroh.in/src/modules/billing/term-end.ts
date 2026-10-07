import type { Prisma } from "@saroh/database";
import { CATALOG_PLAN_KEY_PREFIX } from "@saroh/pricing-catalog";

type Tx = Prisma.TransactionClient;

/**
 * A term that ends with nothing renewed (DEC-093, #803): the plan runs to
 * the end of what was paid, then the business is on Free. Written as the
 * move to Free a business could have chosen itself — a pending move on the
 * period's end with `cancelAtPeriodEnd` — so the existing rules apply it
 * (`moveReadiness` reads it as ready once due; the hourly sweep or the
 * provider's last event applies it) and the plan page reads it as the end.
 *
 * Reached from two places: a monthly subscription's `completed` (its 12
 * charges are done, the last period still running), and the hourly sweep
 * for a yearly plan's one payment (no provider event marks its end).
 */

/** The catalogue's free row on a version, or null when it has none. */
export async function freePlanRowInTx(
    tx: Pick<Tx, "plan">,
    version: number,
): Promise<{ id: string } | null> {
    return tx.plan.findFirst({
        where: {
            key: { startsWith: CATALOG_PLAN_KEY_PREFIX },
            version,
            interval: "month",
            priceCents: 0,
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
    });
}

/**
 * Put the subscription on course for Free at `endsAt`, unless something is
 * already due then (a renewal or a move the business chose). The caller
 * holds the subscription's row lock. True when it was set.
 */
export async function endTermAtInTx(
    tx: Pick<Tx, "plan" | "subscription">,
    sub: { id: string; pendingFrom: Date | null; plan: { version: number } },
    endsAt: Date,
): Promise<boolean> {
    if (sub.pendingFrom) return false;
    const free = await freePlanRowInTx(tx, sub.plan.version);
    if (!free) return false;
    await tx.subscription.update({
        where: { id: sub.id },
        data: {
            pendingPlanId: free.id,
            pendingFrom: endsAt,
            cancelAtPeriodEnd: true,
        },
    });
    return true;
}
