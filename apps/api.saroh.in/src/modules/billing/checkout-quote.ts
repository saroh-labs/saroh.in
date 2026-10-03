import type { BillingCycle } from "@saroh/pricing-catalog";
import {
    addMonthsUtc,
    CATALOG_PLAN_KEY_PREFIX,
    gstPaise,
    withGstPaise,
} from "@saroh/pricing-catalog";

/**
 * How a plan change is made (pricing catalogue U15), as one pure rule the
 * quote, the change and their specs share. Every amount is integer paise,
 * worked out here from the plan rows; the client only ever names a plan and
 * a cycle (KTD-18).
 *
 * - `NONE`: it is the plan it's on.
 * - `TO_FREE`: a plan that costs nothing. At the end of the period already
 *   paid when there is one at the provider, else at once. No checkout.
 * - `NEW`: a paid plan from Free, a cancelled plan, or a plan Saroh doesn't
 *   bill through a provider. A checkout; on the plan once authorised, and the
 *   first charge is the plan's own.
 * - `UPGRADE`: a pricier plan on the same cycle, mid-period. A checkout; on
 *   the plan once authorised. The difference for the rest of the period is
 *   charged then, and the plan's own charges start when the period ends.
 * - `SCHEDULED`: anything else paid — a cheaper plan, the other cycle, or the
 *   plan a "move them" is taking it to. A checkout authorised now; on the
 *   plan from the date (the period's end, or the move's).
 */
export type ChangeKind = "NONE" | "TO_FREE" | "NEW" | "UPGRADE" | "SCHEDULED";

/** A `Plan` row, as much as the rule needs. */
export interface QuotePlanRow {
    id: string;
    key: string;
    version: number;
    interval: string;
    /** Before GST, in paise. */
    priceCents: number;
}

/** The business's subscription, as much as the rule needs. */
export interface QuoteSubscription {
    status: string;
    provider: string | null;
    providerSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
    pendingPlanId: string | null;
    pendingFrom: Date | null;
    plan: QuotePlanRow;
}

export interface ChangeQuote {
    kind: ChangeKind;
    /** The recurring charge, per cycle. */
    pricePaise: number;
    gstPaise: number;
    totalPaise: number;
    /** Taken at authorisation: an upgrade's difference; else zero. */
    chargeNowPaise: number;
    chargeNowGstPaise: number;
    chargeNowTotalPaise: number;
    /** When the plan's own charges start; null: at authorisation. */
    startAt: Date | null;
    /** When it is on the plan; null: once authorised (or now, for Free). */
    effectiveAt: Date | null;
}

const YEAR_MONTHS = 12;

/** The period's start, from its end: one cycle back, clamped to month end. */
export function periodStart(end: Date, cycle: BillingCycle): Date {
    return addMonthsUtc(end, cycle === "year" ? -YEAR_MONTHS : -1);
}

/** The period's end, from its start: one cycle on. */
export function periodEnd(start: Date, cycle: BillingCycle): Date {
    return addMonthsUtc(start, cycle === "year" ? YEAR_MONTHS : 1);
}

/**
 * The difference between two prices for what is left of a period, before
 * GST, rounded half-up to the paisa. Exact: worked in whole milliseconds
 * with BigInt, so no float ever touches money.
 */
export function prorateDifferencePaise(input: {
    fromPaise: number;
    toPaise: number;
    periodStart: Date;
    periodEnd: Date;
    now: Date;
}): number {
    const diff = input.toPaise - input.fromPaise;
    if (diff <= 0) return 0;
    const total = BigInt(
        Math.max(0, input.periodEnd.getTime() - input.periodStart.getTime()),
    );
    const left = BigInt(
        Math.min(
            Math.max(0, input.periodEnd.getTime() - input.now.getTime()),
            Number(total),
        ),
    );
    if (total === 0n || left === 0n) return 0;
    const a = BigInt(diff) * left;
    return Number((2n * a + total) / (2n * total));
}

/** The subscription is billed by Saroh's provider, and still running. */
export function billedByProvider(sub: QuoteSubscription | null): boolean {
    return Boolean(
        sub &&
        sub.status !== "CANCELLED" &&
        sub.provider &&
        sub.providerSubscriptionId &&
        sub.plan.priceCents > 0,
    );
}

/** What changing to `target` would be, and cost. */
export function quoteChange(input: {
    subscription: QuoteSubscription | null;
    target: QuotePlanRow;
    now: Date;
}): ChangeQuote {
    const { subscription: sub, target, now } = input;
    const cycle: BillingCycle = target.interval === "year" ? "year" : "month";
    const price = target.priceCents;
    const base = {
        pricePaise: price,
        gstPaise: gstPaise(price),
        totalPaise: withGstPaise(price),
        chargeNowPaise: 0,
        chargeNowGstPaise: 0,
        chargeNowTotalPaise: 0,
    };
    const live = sub && sub.status !== "CANCELLED" ? sub : null;

    if (live?.plan.id === target.id) {
        return { ...base, kind: "NONE", startAt: null, effectiveAt: null };
    }

    const periodEndAt =
        live?.currentPeriodEnd && live.currentPeriodEnd > now
            ? live.currentPeriodEnd
            : null;

    if (price === 0) {
        const at = billedByProvider(live) && periodEndAt ? periodEndAt : now;
        return { ...base, kind: "TO_FREE", startAt: null, effectiveAt: at };
    }

    const onCatalogue = live?.plan.key.startsWith(CATALOG_PLAN_KEY_PREFIX);
    if (!live || !billedByProvider(live) || !onCatalogue || !periodEndAt) {
        return { ...base, kind: "NEW", startAt: null, effectiveAt: null };
    }

    // The plan a "move them" is taking it to, authorised again (OQ-6).
    if (
        live.pendingPlanId === target.id &&
        live.pendingFrom &&
        live.pendingFrom > now
    ) {
        return {
            ...base,
            kind: "SCHEDULED",
            startAt: live.pendingFrom,
            effectiveAt: live.pendingFrom,
        };
    }

    if (
        live.plan.interval === target.interval &&
        price > live.plan.priceCents
    ) {
        const diff = prorateDifferencePaise({
            fromPaise: live.plan.priceCents,
            toPaise: price,
            periodStart: periodStart(periodEndAt, cycle),
            periodEnd: periodEndAt,
            now,
        });
        return {
            ...base,
            kind: "UPGRADE",
            chargeNowPaise: diff,
            chargeNowGstPaise: gstPaise(diff),
            chargeNowTotalPaise: withGstPaise(diff),
            startAt: periodEndAt,
            effectiveAt: null,
        };
    }

    return {
        ...base,
        kind: "SCHEDULED",
        startAt: periodEndAt,
        effectiveAt: periodEndAt,
    };
}
