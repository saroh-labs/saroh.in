import type { prisma } from "@saroh/database";

import { personName } from "../home/home-model";

type Db = Pick<typeof prisma, "paymentMandate">;

/**
 * Customers' autopay memberships set up at a payment provider (owner,
 * 9 Oct, #921): an ACTIVE `PaymentMandate`, which the provider keeps on
 * its side whatever happens to Saroh's connection. Disconnecting the
 * provider, or deleting the business, stops Saroh syncing with it and
 * charging through it; it cancels nothing at the provider, and the
 * merchant is told so with these counts.
 */
export const ACTIVE_MANDATE = { status: "ACTIVE" } as const;

/** How many are active at each provider, keyed by provider (RAZORPAY…). */
export async function activeMandatesByProvider(
    db: Db,
    organizationId: string,
): Promise<Map<string, number>> {
    const groups = await db.paymentMandate.groupBy({
        by: ["provider"],
        where: { organizationId, ...ACTIVE_MANDATE },
        _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.provider, g._count._all]));
}

export interface ActiveMembershipRow {
    /** The customer subscription it pays for: Subscription Detail. */
    subscriptionId: string;
    customer: string | null;
    plan: string;
    provider: string;
}

/** The most rows a list names; the counts say the rest. */
const LIST_LIMIT = 50;

/** Each provider's count and the memberships, oldest first. */
export async function activeMemberships(
    db: Db,
    organizationId: string,
): Promise<{
    byProvider: { provider: string; active: number }[];
    rows: ActiveMembershipRow[];
}> {
    const [counts, mandates] = await Promise.all([
        activeMandatesByProvider(db, organizationId),
        db.paymentMandate.findMany({
            where: { organizationId, ...ACTIVE_MANDATE },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: LIST_LIMIT,
            select: {
                provider: true,
                subscriptionId: true,
                contact: {
                    select: { firstName: true, lastName: true, email: true },
                },
                subscription: { select: { plan: { select: { name: true } } } },
            },
        }),
    ]);
    return {
        byProvider: [...counts]
            .map(([provider, active]) => ({ provider, active }))
            .sort((a, b) => a.provider.localeCompare(b.provider)),
        rows: mandates.map((m) => ({
            subscriptionId: m.subscriptionId,
            customer: personName(m.contact),
            plan: m.subscription.plan.name,
            provider: m.provider,
        })),
    };
}
