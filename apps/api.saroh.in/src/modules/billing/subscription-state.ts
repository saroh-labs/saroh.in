import { BadRequestException } from "@nestjs/common";

import type { SubscriptionStatus } from "./providers/billing-provider.port";

/**
 * Subscription status state machine (S7-005).
 *
 * The billing webhook inbox moves `Subscription.status` ONLY through the legal
 * transitions below — the SaaS analogue of the merchant order/payment state
 * machine. `ACTIVE ↔ PAST_DUE` covers dunning (a failed charge halts the sub,
 * a recovered charge reactivates it); any live state may go `→ CANCELLED`;
 * `TRIALING` may activate, lapse, or cancel. `CANCELLED` is TERMINAL. A
 * same→same move is an idempotent no-op (never asserted), so a re-delivered
 * event can never error.
 */
const LEGAL_TRANSITIONS: Record<
    SubscriptionStatus,
    ReadonlySet<SubscriptionStatus>
> = {
    TRIALING: new Set<SubscriptionStatus>(["ACTIVE", "PAST_DUE", "CANCELLED"]),
    ACTIVE: new Set<SubscriptionStatus>(["PAST_DUE", "CANCELLED"]),
    PAST_DUE: new Set<SubscriptionStatus>(["ACTIVE", "CANCELLED"]),
    CANCELLED: new Set<SubscriptionStatus>([]),
};

/** Pure predicate: is moving `from → to` (incl. same→same) legal? */
export function isLegalSubscriptionTransition(
    from: SubscriptionStatus,
    to: SubscriptionStatus,
): boolean {
    return from === to || LEGAL_TRANSITIONS[from].has(to);
}

/**
 * Assert a status move is legal. A same→same target returns silently (idempotent
 * no-op); an illegal move throws `BadRequestException`. Callers move state ONLY
 * after this returns.
 */
export function assertSubscriptionTransition(
    from: SubscriptionStatus,
    to: SubscriptionStatus,
): void {
    if (from === to) return;
    if (!LEGAL_TRANSITIONS[from].has(to)) {
        throw new BadRequestException(
            `Illegal subscription transition "${from}" → "${to}"`,
        );
    }
}
