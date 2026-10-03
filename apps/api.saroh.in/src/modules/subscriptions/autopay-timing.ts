import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { DEFAULT_DUE_DAYS } from "../invoices/invoice-state";
import { PRE_DEBIT_LEAD_HOURS } from "../payments/providers/provider.port";

/**
 * When autopay debits a renewal (round-2 D13B, DEC-065): the merchant's
 * choice, for the business (`BusinessProfile.autopayChargeTiming`) with an
 * optional per-plan override (`SubscriptionPlan.autopayChargeTiming`,
 * which wins when set).
 *
 * - `ON_RENEWAL_DATE`: the renewal invoice, and with it the bank's
 *   pre-debit notice, go out {@link AUTOPAY_LEAD_DAYS} days before the
 *   renewal date, so the debit lands on it. Every method gets the early
 *   invoice, even a card or eMandate that needs no notice, so a plan's
 *   invoices always go out on the same day.
 * - `DAY_AFTER_RENEWAL` (the default; D13 as it shipped): the invoice on
 *   the renewal date, the debit {@link PRE_DEBIT_LEAD_HOURS} later — at
 *   once for a method that needs no notice.
 * - `ON_DUE_DATE`: the invoice on the renewal date, the debit at the start
 *   of its due date ({@link DEFAULT_DUE_DAYS} later), its notice placed
 *   {@link AUTOPAY_LEAD_DAYS} days before. No room for a Retry before the
 *   invoice is overdue.
 *
 * A charge's planned debit is written on its intent when the charge is
 * queued (`debitAfter` on a CREATED intent), so changing the setting never
 * moves a charge already queued or prepared.
 *
 * A leaf: the subscriptions and payments modules both read it.
 */

export const AUTOPAY_CHARGE_TIMINGS = [
    "ON_RENEWAL_DATE",
    "DAY_AFTER_RENEWAL",
    "ON_DUE_DATE",
] as const;
export type AutopayChargeTiming = (typeof AUTOPAY_CHARGE_TIMINGS)[number];

/** Every business and plan reads this until the merchant picks. */
export const DEFAULT_AUTOPAY_CHARGE_TIMING: AutopayChargeTiming =
    "DAY_AFTER_RENEWAL";

/**
 * The provider's notice lead, rounded up to whole days: how many days
 * before the renewal date an ON_RENEWAL_DATE invoice goes out (26 hours →
 * 2 days).
 */
export const AUTOPAY_LEAD_DAYS = Math.ceil(PRE_DEBIT_LEAD_HOURS / 24);

const HOUR_MS = 60 * 60 * 1000;

export function isAutopayChargeTiming(v: unknown): v is AutopayChargeTiming {
    return (
        typeof v === "string" &&
        (AUTOPAY_CHARGE_TIMINGS as readonly string[]).includes(v)
    );
}

/** A stored value as a timing; anything strange reads as the default. */
export function timingOf(v: unknown): AutopayChargeTiming {
    return isAutopayChargeTiming(v) ? v : DEFAULT_AUTOPAY_CHARGE_TIMING;
}

/**
 * Whether a mandate's method waits on a pre-debit notice. UPI does (and a
 * mandate whose method is unknown is treated as UPI, as Razorpay's adapter
 * does); a card or eMandate answers NOT_NEEDED and may be debited at once.
 */
export function needsNotice(method: string | null | undefined): boolean {
    return method === "UPI" || method == null;
}

/** The earliest a debit can go when its charge is prepared `now`. */
export function earliestDebit(
    now: Date,
    method: string | null | undefined,
): Date {
    return needsNotice(method)
        ? new Date(now.getTime() + PRE_DEBIT_LEAD_HOURS * HOUR_MS)
        : now;
}

/** When an ON_RENEWAL_DATE renewal's invoice goes out: lead days before it. */
export function earlyIssueAt(renewal: Date, timezone: string): Date {
    return DateTime.fromJSDate(renewal, { zone: timezone })
        .minus({ days: AUTOPAY_LEAD_DAYS })
        .toJSDate();
}

/** The start of the invoice's due date, in the subscription's zone. */
function dueDayStart(issuedAt: Date, timezone: string): Date {
    return DateTime.fromJSDate(issuedAt, { zone: timezone })
        .plus({ days: DEFAULT_DUE_DAYS })
        .startOf("day")
        .toJSDate();
}

function later(a: Date, b: Date): Date {
    return a > b ? a : b;
}

export interface ChargePlan {
    /** The debit's planned time: the charge's intent keeps it. */
    debitAt: Date;
    /** When its first step (the order and notice) runs. */
    prepareAt: Date;
}

/**
 * A renewal charge's plan under `timing`, queued `now` for the period
 * starting `periodStart` (the renewal date). Null for DAY_AFTER_RENEWAL:
 * D13's timing, prepared at once and debited when the notice allows.
 */
export function chargePlan(
    timing: AutopayChargeTiming,
    input: {
        now: Date;
        periodStart: Date;
        timezone: string;
        method: string | null | undefined;
    },
): ChargePlan | null {
    const { now, periodStart, timezone, method } = input;
    const soonest = earliestDebit(now, method);
    let debitAt: Date;
    switch (timing) {
        case "DAY_AFTER_RENEWAL":
            return null;
        case "ON_RENEWAL_DATE":
            debitAt = later(periodStart, soonest);
            break;
        case "ON_DUE_DATE":
            debitAt = later(dueDayStart(now, timezone), soonest);
            break;
    }
    const noticeFrom = DateTime.fromJSDate(debitAt, { zone: timezone })
        .minus({ days: AUTOPAY_LEAD_DAYS })
        .toJSDate();
    return { debitAt, prepareAt: later(now, noticeFrom) };
}

/**
 * The plan of a charge queued again with the debit it already had planned
 * (the charge job's resume, after it stood aside for a pay-link checkout):
 * the setting changing since never moves it. The notice goes
 * {@link AUTOPAY_LEAD_DAYS} days before, or now when that has passed.
 */
export function keptPlan(debitAt: Date, now: Date): ChargePlan {
    const noticeFrom = new Date(
        debitAt.getTime() - AUTOPAY_LEAD_DAYS * 24 * 60 * 60 * 1000,
    );
    return { debitAt, prepareAt: later(now, noticeFrom) };
}

/**
 * When the next renewal's autopay charge will go, for the customer
 * ("Next autopay charge: ‹date›"), from the renewal date and the timing.
 */
export function projectedCharge(
    timing: AutopayChargeTiming,
    input: {
        renewal: Date;
        timezone: string;
        method: string | null | undefined;
    },
): Date {
    const { renewal, timezone, method } = input;
    switch (timing) {
        case "ON_RENEWAL_DATE":
            return renewal;
        case "DAY_AFTER_RENEWAL":
            return earliestDebit(renewal, method);
        case "ON_DUE_DATE":
            return dueDayStart(renewal, timezone);
    }
}

type Db = Pick<
    Prisma.TransactionClient,
    "businessProfile" | "subscriptionPlan"
>;

/** The business's setting; no profile yet reads as the default. */
export async function businessChargeTiming(
    db: Pick<Prisma.TransactionClient, "businessProfile">,
    organizationId: string,
): Promise<AutopayChargeTiming> {
    const profile = await db.businessProfile.findUnique({
        where: { organizationId },
        select: { autopayChargeTiming: true },
    });
    return timingOf(profile?.autopayChargeTiming);
}

/** The timing a plan's renewals charge on: the plan's, else the business's. */
export async function effectiveChargeTiming(
    db: Db,
    organizationId: string,
    planId: string,
): Promise<AutopayChargeTiming> {
    const plan = await db.subscriptionPlan.findFirst({
        where: { id: planId, organizationId },
        select: { autopayChargeTiming: true },
    });
    return isAutopayChargeTiming(plan?.autopayChargeTiming)
        ? plan.autopayChargeTiming
        : businessChargeTiming(db, organizationId);
}
