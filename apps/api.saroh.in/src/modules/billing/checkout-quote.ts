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
 * - `TRIAL` (U16): a paid plan with a free trial, where `NEW` would be and
 *   the business may still have one, or another paid plan while a trial
 *   runs (the same end). A checkout; on the plan once authorised, its first
 *   charge at `startAt`, the trial's end. With the catalogue's nominal first
 *   month (DEC-093) that month's charge is taken at authorisation.
 * - `RENEW` (DEC-093, #803): the plan it's on, again, once its 12-month
 *   term is about to end (`RENEW_WINDOW_DAYS`). A checkout authorised now
 *   for a new term starting when this one ends, at the live price.
 *
 * How it's paid (DEC-093): monthly on autopay for `TERM_CHARGES` charges,
 * then a one-tap renewal; yearly as one payment for the year, taken when
 * the business pays, with no autopay at all. So a yearly plan never has a
 * trial, and the set-up check autopay needs (`mandateCheck`) is named for
 * what it is: a charge that pays for something, or a small amount the
 * provider takes and refunds.
 *
 * A coupon (U16) applies to a checkout that starts a plan (`NEW`, `TRIAL`):
 * off each of the first months on monthly, or that many months' worth once
 * off the first yearly charge, never more than the charge.
 */
export type ChangeKind =
    "NONE" | "TO_FREE" | "NEW" | "UPGRADE" | "SCHEDULED" | "TRIAL" | "RENEW";

/** How many monthly charges one autopay term runs for (DEC-093, R15). */
export const TERM_CHARGES = 12;

/** How long before a term ends its one-tap renewal opens. */
export const RENEW_WINDOW_DAYS = 30;

/**
 * How a change is paid: monthly on autopay, yearly as one payment
 * (DEC-093). Nothing to pay (NONE, TO_FREE) reads as autopay and is never
 * shown.
 */
export type PaymentKind = "AUTOPAY" | "ONE_TIME";

/**
 * What setting up autopay takes now: `PAID` — the payment taken is a real
 * charge (a first month, a first charge, an upgrade's difference) and is
 * kept; `REFUNDED` — nothing is owed now, so the provider takes a small
 * amount to check the mandate and refunds it; `NONE` — no autopay (a
 * one-time payment, or nothing to pay).
 */
export type MandateCheck = "PAID" | "REFUNDED" | "NONE";

/** The kinds a coupon can be used on. */
export const COUPON_KINDS: readonly ChangeKind[] = ["NEW", "TRIAL"];

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

/** A coupon, as much as the rule needs: off a month, for so many months. */
export interface QuoteCoupon {
    discountPaise: number;
    months: number;
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
    /** A trial's end, when the first charge is taken (TRIAL); else null. */
    trialEndsAt: Date | null;
    /**
     * A coupon's discount: off each of the first `discountCharges` charges
     * of the plan, before GST. Zero and zero without one (or where it can't
     * apply).
     */
    discountPaise: number;
    discountCharges: number;
    /** The plan's first charge after the discount, its GST and the total. */
    firstChargePaise: number;
    firstChargeGstPaise: number;
    firstChargeTotalPaise: number;
    /**
     * What the provider takes off each discounted charge, GST included:
     * the full charge with GST less the discounted one with GST, so what it
     * charges is exactly what Saroh's invoice says.
     */
    discountTotalPaise: number;
    /** Monthly autopay, or yearly's one payment (DEC-093). */
    payment: PaymentKind;
    /** Charges the change commits to: 12 monthly, 1 yearly; 0 for none. */
    termCharges: number;
    /**
     * Exactly what the business pays when it authorises, GST included: a
     * first charge, a first month, an upgrade's difference, a year paid
     * ahead — or zero.
     */
    payNowTotalPaise: number;
    mandateCheck: MandateCheck;
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

/**
 * A coupon's discount on a plan's charge: monthly, its discount (no more than
 * the charge) off each of its months; yearly, that many months' worth once,
 * off the first yearly charge, no more than the charge.
 */
export function couponDiscount(
    coupon: QuoteCoupon,
    pricePaise: number,
    cycle: BillingCycle,
): { discountPaise: number; discountCharges: number } {
    const off =
        cycle === "year"
            ? coupon.discountPaise * coupon.months
            : coupon.discountPaise;
    const discountPaise = Math.max(0, Math.min(off, pricePaise));
    if (discountPaise === 0) return { discountPaise: 0, discountCharges: 0 };
    return {
        discountPaise,
        discountCharges: cycle === "year" ? 1 : Math.max(1, coupon.months),
    };
}

/** What changing to `target` would be, and cost. */
export function quoteChange(input: QuoteInput): ChangeQuote {
    const base = baseQuote(input);
    const cycle: BillingCycle =
        input.target.interval === "year" ? "year" : "month";
    const price = input.target.priceCents;
    const off =
        input.coupon && COUPON_KINDS.includes(base.kind)
            ? couponDiscount(input.coupon, price, cycle)
            : { discountPaise: 0, discountCharges: 0 };
    const first = price - off.discountPaise;
    const firstTotal = withGstPaise(first);
    const nothing = base.kind === "NONE" || base.kind === "TO_FREE";
    const payment: PaymentKind =
        cycle === "year" && !nothing ? "ONE_TIME" : "AUTOPAY";
    const payNowTotalPaise = nothing
        ? 0
        : payment === "ONE_TIME"
          ? base.kind === "UPGRADE"
              ? base.chargeNowTotalPaise
              : firstTotal
          : base.kind === "NEW"
            ? firstTotal
            : base.chargeNowTotalPaise;
    return {
        ...base,
        ...off,
        firstChargePaise: first,
        firstChargeGstPaise: gstPaise(first),
        firstChargeTotalPaise: firstTotal,
        discountTotalPaise: withGstPaise(price) - firstTotal,
        payment,
        termCharges: nothing ? 0 : payment === "ONE_TIME" ? 1 : TERM_CHARGES,
        payNowTotalPaise,
        mandateCheck:
            nothing || payment === "ONE_TIME"
                ? "NONE"
                : payNowTotalPaise > 0
                  ? "PAID"
                  : "REFUNDED",
    };
}

export interface QuoteInput {
    subscription: QuoteSubscription | null;
    target: QuotePlanRow;
    now: Date;
    /**
     * The target plan's free trial, in days, when the business may still
     * have one (the service decides: the plan offers one and it never had
     * one). Null: no trial. Never on yearly, which has no autopay to take
     * the first charge later (DEC-093).
     */
    trialDays?: number | null;
    /**
     * What the trial's days cost, before GST (DEC-093's nominal first
     * month, from the catalogue): taken at authorisation. Zero: free.
     */
    trialFirstPaise?: number;
    /**
     * When the 12-month term of the plan it's on ends (`billing-term.ts`),
     * when it has one: the same plan is then a renewal from that date.
     */
    termEndsAt?: Date | null;
    /** A coupon to apply, already checked as usable (the service's job). */
    coupon?: QuoteCoupon | null;
}

type BaseQuote = Omit<
    ChangeQuote,
    | "discountPaise"
    | "discountCharges"
    | "firstChargePaise"
    | "firstChargeGstPaise"
    | "firstChargeTotalPaise"
    | "discountTotalPaise"
    | "payment"
    | "termCharges"
    | "payNowTotalPaise"
    | "mandateCheck"
>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The term ends soon enough that the same plan is its renewal. */
export function renewOpen(termEndsAt: Date | null | undefined, now: Date) {
    if (!termEndsAt || termEndsAt.getTime() <= now.getTime()) return false;
    return termEndsAt.getTime() - now.getTime() <= RENEW_WINDOW_DAYS * DAY_MS;
}

function baseQuote(input: QuoteInput): BaseQuote {
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
        trialEndsAt: null,
    };
    const live = sub && sub.status !== "CANCELLED" ? sub : null;

    // The plan it's on, on the same cycle, at its term's end: a renewal
    // from that date at today's price (the live row), else nothing to do.
    if (
        live &&
        price > 0 &&
        live.plan.key === target.key &&
        live.plan.interval === target.interval &&
        billedByProvider(live) &&
        input.termEndsAt &&
        renewOpen(input.termEndsAt, now)
    ) {
        return {
            ...base,
            kind: "RENEW",
            startAt: input.termEndsAt,
            effectiveAt: input.termEndsAt,
        };
    }
    if (live?.plan.id === target.id) {
        return { ...base, kind: "NONE", startAt: null, effectiveAt: null };
    }

    const periodEndAt =
        live?.currentPeriodEnd && live.currentPeriodEnd > now
            ? live.currentPeriodEnd
            : null;
    const trialing = live?.status === "TRIALING";

    if (price === 0) {
        // A trial paid nothing ahead: Free at once.
        const at =
            billedByProvider(live) && periodEndAt && !trialing
                ? periodEndAt
                : now;
        return { ...base, kind: "TO_FREE", startAt: null, effectiveAt: at };
    }

    const onCatalogue = live?.plan.key.startsWith(CATALOG_PLAN_KEY_PREFIX);
    if (!live || !billedByProvider(live) || !onCatalogue || !periodEndAt) {
        const days = cycle === "month" ? (input.trialDays ?? 0) : 0;
        if (days > 0) {
            const ends = new Date(now.getTime() + days * DAY_MS);
            // The nominal first month (DEC-093), taken as it's authorised.
            const first = Math.max(
                0,
                Math.min(input.trialFirstPaise ?? 0, price),
            );
            return {
                ...base,
                kind: "TRIAL",
                chargeNowPaise: first,
                chargeNowGstPaise: gstPaise(first),
                chargeNowTotalPaise: withGstPaise(first),
                startAt: ends,
                effectiveAt: null,
                trialEndsAt: ends,
            };
        }
        return { ...base, kind: "NEW", startAt: null, effectiveAt: null };
    }

    // Yearly while a trial runs: one payment, so the year starts now.
    if (trialing && cycle === "year") {
        return { ...base, kind: "NEW", startAt: null, effectiveAt: null };
    }
    // Another plan while a trial runs: still a trial, to the same end. Its
    // first month was paid with the first checkout; nothing more now.
    if (trialing) {
        return {
            ...base,
            kind: "TRIAL",
            startAt: periodEndAt,
            effectiveAt: null,
            trialEndsAt: periodEndAt,
        };
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
