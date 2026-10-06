import type { Prisma } from "@saroh/database";
import { DateTime } from "luxon";

import { OPEN_ORDER_STATUSES } from "./open-orders";

/**
 * A website order to be paid on collection or delivery that nobody came for
 * (R34, the owner's rule of 6 Oct 2026). Such an order promises its units
 * the moment it is placed (`checkout-order.ts`), so one the customer never
 * collects keeps that stock from everyone else.
 *
 * Still unpaid, and neither collected nor delivered, three days after it was
 * placed — counted in whole days of the business's calendar, so an order
 * placed on Monday at any hour is "not collected" from Thursday's start —
 * it shows on Home under Attention, with the days counting up, and the team
 * is told once (`team.alert`, event `uncollected`). Staff then cancel it
 * (the usual cancel, which puts the stock back) or keep waiting. **Nothing
 * cancels on its own.** The row goes once it is paid, handed over or
 * cancelled; the alert is never repeated.
 *
 * Pure, and the one definition Home, the alert and Order Detail read.
 */

/** Days after it was placed before an unpaid handover order needs someone. */
export const UNCOLLECTED_AFTER_DAYS = 3;

/** Not paid: nothing taken, or a pay-link payment that didn't go through. */
const NOT_PAID = ["UNPAID", "FAILED"] as const;

/** What the rule reads from an order. */
export interface UncollectedFacts {
    payOnHandover: boolean;
    paymentStatus: string;
    status: string;
    /** When it was placed: `Order.createdAt`. */
    createdAt: Date;
}

/**
 * Placed to be paid on handover, still not paid, and its goods haven't
 * reached the customer (open: not collected, delivered or cancelled).
 */
export function awaitsHandover(
    order: Omit<UncollectedFacts, "createdAt">,
): boolean {
    return (
        order.payOnHandover &&
        (NOT_PAID as readonly string[]).includes(order.paymentStatus) &&
        (OPEN_ORDER_STATUSES as readonly string[]).includes(order.status)
    );
}

/** Whole calendar days in `zone` from the day it was placed to today. */
export function daysSincePlaced(
    placedAt: Date,
    now: Date,
    zone: string,
): number {
    const placed = DateTime.fromJSDate(placedAt, { zone }).startOf("day");
    const today = DateTime.fromJSDate(now, { zone }).startOf("day");
    return Math.max(0, Math.round(today.diff(placed, "days").days));
}

/**
 * How many days it has gone uncollected, from the third on; null for an
 * order the rule doesn't (or no longer) apply to.
 */
export function uncollectedDays(
    order: UncollectedFacts,
    now: Date,
    zone: string,
): number | null {
    if (!awaitsHandover(order)) return null;
    const days = daysSincePlaced(order.createdAt, now, zone);
    return days >= UNCOLLECTED_AFTER_DAYS ? days : null;
}

/**
 * The instant an order placed at `placedAt` becomes uncollected: the start
 * of the third day after it, in the business's zone. The alert is queued
 * for it.
 */
export function uncollectedFrom(placedAt: Date, zone: string): Date {
    return DateTime.fromJSDate(placedAt, { zone })
        .startOf("day")
        .plus({ days: UNCOLLECTED_AFTER_DAYS })
        .toJSDate();
}

/**
 * A business's uncollected orders as a Prisma `where`: placed before the
 * start of the day two days ago, in its zone — that is, on or before the
 * day three days back.
 */
export function uncollectedWhere(
    organizationId: string,
    now: Date,
    zone: string,
): Prisma.OrderWhereInput {
    const before = DateTime.fromJSDate(now, { zone })
        .startOf("day")
        .minus({ days: UNCOLLECTED_AFTER_DAYS - 1 })
        .toJSDate();
    return {
        organizationId,
        payOnHandover: true,
        paymentStatus: { in: [...NOT_PAID] },
        status: { in: [...OPEN_ORDER_STATUSES] },
        createdAt: { lt: before },
    };
}

/** "Not collected", or for an order that goes out, "Not delivered". */
export function notHandedOverWords(fulfilment: string): string {
    return fulfilment === "PICKUP" ? "Not collected" : "Not delivered";
}

/** "Not collected: 4 days", the row's tag and the alert's words. */
export function uncollectedTag(fulfilment: string, days: number): string {
    return `${notHandedOverWords(fulfilment)}: ${days} day${days === 1 ? "" : "s"}`;
}
