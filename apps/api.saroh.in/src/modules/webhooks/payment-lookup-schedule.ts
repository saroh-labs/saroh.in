import type { Prisma } from "@saroh/database";

import { OPEN_INTENT_STATUSES } from "../payments/intent-state";

/**
 * When the pending sweep asks the provider about an open intent again (P1).
 *
 * A payment whose webhook never came is found by asking. The first ask
 * comes a few minutes after the intent was made — long enough for the
 * webhook to have arrived, and well inside a booking hold's 15 minutes —
 * and the pause grows with the intent's age, so an abandoned checkout costs
 * a handful of calls, not one a minute for days. Past {@link LOOKUP_WINDOW_MS}
 * the sweep stops asking; `payments reconcile` still asks about any open
 * intent of a business, whatever its age.
 */

/** No ask before an intent is this old: its webhook normally comes first. */
export const FIRST_LOOKUP_AFTER_MS = 3 * 60_000;

/** The sweep stops asking about an intent this old. */
export const LOOKUP_WINDOW_MS = 3 * 24 * 60 * 60_000;

/** By age: an intent younger than `under` is asked again after `every`. */
export const LOOKUP_TIERS: readonly { under: number; every: number }[] = [
    // A booking hold lasts 15 minutes: ask every few minutes while young.
    { under: 30 * 60_000, every: 3 * 60_000 },
    { under: 6 * 60 * 60_000, every: 30 * 60_000 },
    { under: LOOKUP_WINDOW_MS, every: 6 * 60 * 60_000 },
];

/**
 * The open intents due an ask at `now`: made with the provider (it has an
 * order id), old enough, not too old, and not asked within its tier's
 * pause. One OR per tier, so the database does the choosing and a batch is
 * never filled with intents that are not due.
 */
export function dueForLookup(now: Date): Prisma.PaymentIntentWhereInput {
    const at = now.getTime();
    let younger = 0;
    const tiers: Prisma.PaymentIntentWhereInput[] = LOOKUP_TIERS.map((tier) => {
        const from = Math.max(younger, FIRST_LOOKUP_AFTER_MS);
        younger = tier.under;
        return {
            createdAt: {
                lte: new Date(at - from),
                gt: new Date(at - tier.under),
            },
            OR: [
                { lastLookupAt: null },
                { lastLookupAt: { lte: new Date(at - tier.every) } },
            ],
        };
    });
    return {
        status: { in: [...OPEN_INTENT_STATUSES] },
        providerIntentId: { not: null },
        OR: tiers,
    };
}
