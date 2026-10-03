import type { BillingCycle } from "./price";

/** A business hears about a move at least this many days before it applies (KTD-4). */
export const MOVE_NOTICE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The same day `months` later, clamped to the month's end (31 Jan + 1 → 28/29 Feb). */
export function addMonthsUtc(d: Date, months: number): Date {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + months;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(
        Date.UTC(
            y,
            m,
            Math.min(d.getUTCDate(), last),
            d.getUTCHours(),
            d.getUTCMinutes(),
            d.getUTCSeconds(),
            d.getUTCMilliseconds(),
        ),
    );
}

/**
 * When "move them" applies to one subscription: its first billing date at
 * least {@link MOVE_NOTICE_DAYS} days after the version goes live (KTD-4,
 * design deviation D-6). `billingDate` is the subscription's next renewal;
 * later renewals step by its cycle from there, so a renewal on the 31st
 * stays the month's last day rather than drifting.
 */
export function moveDateFor(
    billingDate: Date,
    goLiveAt: Date,
    cycle: BillingCycle = "month",
): Date {
    const earliest = goLiveAt.getTime() + MOVE_NOTICE_DAYS * DAY_MS;
    const step = cycle === "year" ? 12 : 1;
    let k = 0;
    let at = billingDate;
    while (at.getTime() < earliest) {
        k += step;
        at = addMonthsUtc(billingDate, k);
    }
    return at;
}
