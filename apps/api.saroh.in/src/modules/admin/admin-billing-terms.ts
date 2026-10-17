import type { Prisma } from "@saroh/database";

import type { Term } from "../billing/billing-term";
import {
    autopayChargesOfVersion,
    TERM_CHECKOUT_SELECT,
    termOf,
} from "../billing/billing-term";

type Db = Pick<
    Prisma.TransactionClient,
    "billingCheckout" | "pricingCatalogVersion"
>;

interface SubForTerm {
    id: string;
    status: string;
    provider: string | null;
    providerSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
    plan: { priceCents: number };
}

/**
 * When each subscription's autopay (or year paid once) runs out, by the
 * rule the plan page and the renewal sweep share (`billing-term.ts`,
 * DEC-093, DEC-161), for a page of subscriptions at once: one read of
 * their checkouts and one of each catalogue version's autopay count.
 * A subscription with no term (Free, cancelled, not billed through a
 * checkout) has no entry.
 */
export async function subscriptionTerms(
    db: Db,
    subs: SubForTerm[],
    now: Date,
): Promise<Map<string, Term>> {
    const billed = subs.flatMap((s) =>
        s.status !== "CANCELLED" &&
        s.provider &&
        s.providerSubscriptionId &&
        s.plan.priceCents > 0
            ? [
                  {
                      ...s,
                      provider: s.provider,
                      providerSubscriptionId: s.providerSubscriptionId,
                  },
              ]
            : [],
    );
    const terms = new Map<string, Term>();
    if (billed.length === 0) return terms;
    const checkouts = await db.billingCheckout.findMany({
        where: {
            OR: billed.map((s) => ({
                provider: s.provider,
                providerSubscriptionId: s.providerSubscriptionId,
            })),
        },
        select: {
            ...TERM_CHECKOUT_SELECT,
            provider: true,
            providerSubscriptionId: true,
        },
    });
    const byKey = new Map(
        checkouts.map((c) => [`${c.provider}:${c.providerSubscriptionId}`, c]),
    );
    const charges = new Map<number, number>();
    for (const sub of billed) {
        const checkout = byKey.get(
            `${sub.provider}:${sub.providerSubscriptionId}`,
        );
        if (!checkout) continue;
        const version = checkout.plan.version;
        let autopayCharges = charges.get(version);
        if (autopayCharges === undefined) {
            autopayCharges = await autopayChargesOfVersion(db, version);
            charges.set(version, autopayCharges);
        }
        const term = termOf(sub, { ...checkout, autopayCharges }, now);
        if (term) terms.set(sub.id, term);
    }
    return terms;
}
