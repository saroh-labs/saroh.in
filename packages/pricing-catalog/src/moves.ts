import type { BillingCycle } from "./price";
import type { Catalog } from "./schema";
import { cellOf } from "./schema";

/** A business hears about a move at least this many days before it applies (KTD-4). */
export const MOVE_NOTICE_DAYS = 7;

/**
 * A move that changes the price a business pays is told at least this many
 * days ahead (DEC-161, the Terms' "at least 30 days' notice by email"), and
 * the business is asked to approve the new amount. Until it does, it keeps
 * paying the price it has.
 */
export const PRICE_NOTICE_DAYS = 30;

/**
 * How far ahead a move to `toPaise` from `fromPaise` is told: 30 days when
 * the price changes, else 7.
 */
export function moveNoticeDays(fromPaise: number, toPaise: number): number {
    return fromPaise === toPaise ? MOVE_NOTICE_DAYS : PRICE_NOTICE_DAYS;
}

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
 * least `noticeDays` after the version goes live (KTD-4, design deviation
 * D-6): {@link MOVE_NOTICE_DAYS}, or {@link PRICE_NOTICE_DAYS} when the price
 * it pays changes (DEC-161). `billingDate` is the subscription's next renewal;
 * later renewals step by its cycle from there, so a renewal on the 31st
 * stays the month's last day rather than drifting.
 */
export function moveDateFor(
    billingDate: Date,
    goLiveAt: Date,
    cycle: BillingCycle = "month",
    noticeDays: number = MOVE_NOTICE_DAYS,
): Date {
    const earliest = goLiveAt.getTime() + noticeDays * DAY_MS;
    const step = cycle === "year" ? 12 : 1;
    let k = 0;
    let at = billingDate;
    while (at.getTime() < earliest) {
        k += step;
        at = addMonthsUtc(billingDate, k);
    }
    return at;
}

/**
 * A business stays on the version it is billed on until a move (KTD-4), but
 * a row its plan has gained since is its at once (DEC-186, owner 24 Oct
 * 2026): a cell off on its own version and included on the live one reads
 * as the live cell. Only additions: no row is taken away, no included
 * row's limit changes, and the price stays its own version's.
 */
export function withLiveAdditions(own: Catalog, live: Catalog): Catalog {
    const modules = own.modules.map((m) => {
        const later = live.modules.find((x) => x.id === m.id);
        if (!later) return m;
        let cells = m.cells;
        for (const plan of own.plans) {
            const now = cellOf(later, plan.id);
            if (now.inc && !cellOf(m, plan.id).inc) {
                cells = { ...cells, [plan.id]: now };
            }
        }
        return cells === m.cells ? m : { ...m, cells };
    });
    return { ...own, modules };
}
